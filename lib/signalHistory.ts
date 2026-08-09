import type { Db } from "mongodb";
import { getDashboardRows } from "@/lib/data";
import { sendPushToAll } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/callpro";
import { recordNotifications } from "@/lib/notifications";
import { SIGNAL_LABELS, type Signal } from "@/lib/types";

/**
 * Which engine produced a stored signal.
 *
 * 1 was the six-indicator rule engine. 2 is the combined analysis — the
 * scorecard, the ratios against the sector and the risk figures — which is
 * what a company's own page has always shown and what the whole app reads
 * now.
 *
 * Bump this whenever a change would move verdicts across the market. A
 * signal is only comparable with one from the same engine: measured against
 * the other, most of the market appears to move at once, and the reader is
 * handed a hundred alerts about companies that did nothing. Stored signals
 * from an older engine are re-baselined silently below instead.
 */
const SIGNAL_ENGINE_VERSION = 2;

interface SignalHistoryDoc {
  companyCode: number;
  symbol: string;
  signal: Signal;
  updatedAt: Date;
  /** Absent on documents written before engines were numbered, i.e. engine 1. */
  engine?: number;
}

export interface SignalChange {
  symbol: string;
  name: string;
  from: Signal | "NEW";
  to: Signal;
}

/**
 * Compares freshly computed recommendations against the last-known signal
 * per company. On the very first run (no history yet) it just seeds the
 * baseline silently — otherwise every company would show up as "changed".
 * Any real BUY/SELL/HOLD transitions found after that are pushed to all
 * subscribed devices as a single summary notification.
 */
/**
 * Sends the same summary over SMS, but only when the operator has switched it
 * on and configured CallPro. Failures are swallowed per recipient so one bad
 * number cannot stop the rest of the alert run.
 */
async function sendSignalSms(db: Db, body: string): Promise<number> {
  const { sms } = await getSettings(db);
  if (!sms.enabled || !sms.apiKey || !sms.from || sms.recipients.length === 0) {
    return 0;
  }

  const creds = { apiKey: sms.apiKey, from: sms.from, brand: sms.brand };
  const results = await Promise.all(
    sms.recipients.map(async (to) => {
      const result = await sendSms(creds, to, body);
      if (!result.ok) console.error(`sms to ${to} failed: ${result.error}`);
      return result.ok;
    }),
  );
  return results.filter(Boolean).length;
}

export async function checkSignalChangesAndNotify(db: Db): Promise<{
  changes: SignalChange[];
  notified: boolean;
  smsSent: number;
  /** Delivery failures, so a silent run says why it was silent. */
  pushErrors?: string[];
}> {
  const rows = await getDashboardRows(db);
  const priced = rows.filter((r) => r.lastPrice !== null);

  const historyCollection = db.collection<SignalHistoryDoc>("signalHistory");
  const existing = await historyCollection.find({}).toArray();
  const isFirstRun = existing.length === 0;
  // Only signals from the current engine are something this run can be
  // compared against. A company still carrying an older engine's verdict has
  // no comparable previous state, so it falls through as NEW — recorded,
  // announced to nobody, and comparable from the next run onwards.
  const previousByCode = new Map(
    existing
      .filter((h) => (h.engine ?? 1) === SIGNAL_ENGINE_VERSION)
      .map((h) => [h.companyCode, h.signal]),
  );

  const changes: SignalChange[] = [];
  const ops = priced.map((row) => {
    const previous = previousByCode.get(row.companyCode);
    if (!isFirstRun && previous !== row.signal) {
      changes.push({
        symbol: row.symbol,
        name: row.name,
        from: previous ?? "NEW",
        to: row.signal,
      });
    }
    return {
      updateOne: {
        filter: { companyCode: row.companyCode },
        update: {
          $set: {
            companyCode: row.companyCode,
            symbol: row.symbol,
            signal: row.signal,
            updatedAt: new Date(),
            engine: SIGNAL_ENGINE_VERSION,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await historyCollection.bulkWrite(ops, { ordered: false });
  }

  // A first classification is not a change. The sync prices a few companies
  // per run and takes days to work through four hundred listings, so every
  // one of them reaches this point as NEW at some point — and announcing
  // those would hand the reader four hundred alerts saying the app had
  // finished thinking about a company for the first time. They are kept in
  // the history above, which is what makes the *next* move announceable.
  const moved = changes.filter((c) => c.from !== "NEW");

  if (isFirstRun || moved.length === 0) {
    return { changes, notified: false, smsSent: 0 };
  }

  // Every move is written to the in-app feed. The setting below decides what
  // is worth interrupting someone with — a push, an SMS — not what is worth
  // recording: a signal that moved to ХҮЛЭЭХ is still something the reader
  // went looking for and did not find.
  await recordNotifications(
    db,
    moved.map((c) => ({
      title: `${c.symbol}: ${SIGNAL_LABELS[c.to]} дохио`,
      body: `${c.name} — ${SIGNAL_LABELS[c.from as Signal]} байснаа ${SIGNAL_LABELS[c.to]} боллоо`,
      url: `/stock/${c.symbol}`,
      kind: "signal" as const,
      symbol: c.symbol,
      signal: c.to,
      previousSignal: c.from,
    })),
  );

  // Operators pick which transitions are worth interrupting people for.
  const { notifications } = await getSettings(db);
  const alerting = moved.filter((c) => notifications.signals.includes(c.to));
  if (alerting.length === 0) {
    return { changes, notified: false, smsSent: 0 };
  }

  const preview = alerting
    .slice(0, 5)
    .map((c) => `${c.symbol} ${c.from}→${c.to}`)
    .join(", ");
  const body =
    alerting.length > 5 ? `${preview} +${alerting.length - 5} бусад` : preview;

  const title = `MSE: ${alerting.length} дохио шинэчлэгдлээ`;

  // The phone gets one banner — nobody wants twelve; the feed above has a
  // row per company, because a row is something you tap.
  const [result, smsSent] = await Promise.all([
    notifications.pushEnabled
      ? sendPushToAll(db, {
          title,
          body,
          url: "/notifications",
          tag: "mse-signal-change",
        })
      : Promise.resolve({ sent: 0, pruned: 0, errors: ["Push унтраалттай."] }),
    sendSignalSms(db, `${title}. ${body}`).catch((err) => {
      console.error("signal sms failed", err);
      return 0;
    }),
  ]);

  return {
    changes,
    notified: result.sent > 0,
    smsSent,
    pushErrors: result.errors.length > 0 ? result.errors : undefined,
  };
}

/** How often the market is re-checked for signal changes. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

interface SignalCheckMarker {
  key: string;
  checkedAt: Date;
}

/**
 * Runs the check unless it has just run.
 *
 * The daily sync used to be the only caller, which meant a signal that
 * turned during a session was reported the next time the cron fired — up to
 * a day later, and long after the badge on screen had already changed. The
 * home page asks for this after it has answered, so the market is re-checked
 * whenever somebody is looking, and the marker keeps that to once a quarter
 * of an hour however many people are.
 */
export async function checkSignalChangesIfDue(db: Db): Promise<boolean> {
  const marker = db.collection<SignalCheckMarker>("signalCheckMarker");
  // Claimed with the same condition that reads it, so two requests arriving
  // together cannot both decide it is their turn.
  const claimed = await marker.updateOne(
    {
      key: "main",
      $or: [
        { checkedAt: { $lt: new Date(Date.now() - CHECK_INTERVAL_MS) } },
        { checkedAt: { $exists: false } },
      ],
    },
    { $set: { key: "main", checkedAt: new Date() } },
    { upsert: false },
  );
  if (claimed.matchedCount === 0) {
    // Either it ran recently, or there is no marker yet to claim.
    const created = await marker
      .updateOne(
        { key: "main" },
        { $setOnInsert: { key: "main", checkedAt: new Date() } },
        { upsert: true },
      )
      .catch(() => null);
    if (!created?.upsertedCount) return false;
  }

  try {
    await checkSignalChangesAndNotify(db);
    return true;
  } catch (err) {
    console.error("scheduled signal check failed", err);
    return false;
  }
}
