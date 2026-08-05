import type { Db } from "mongodb";
import { getDashboardRows } from "@/lib/data";
import { sendPushToAll } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { sendSms } from "@/lib/callpro";
import { recordNotification } from "@/lib/notifications";
import type { Signal } from "@/lib/types";

interface SignalHistoryDoc {
  companyCode: number;
  symbol: string;
  signal: Signal;
  updatedAt: Date;
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
  const previousByCode = new Map(existing.map((h) => [h.companyCode, h.signal]));

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
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await historyCollection.bulkWrite(ops, { ordered: false });
  }

  if (isFirstRun || changes.length === 0) {
    return { changes, notified: false, smsSent: 0 };
  }

  // Operators pick which transitions are worth interrupting people for.
  const { notifications } = await getSettings(db);
  const alerting = changes.filter((c) => notifications.signals.includes(c.to));
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

  await recordNotification(db, { title, body, url: "/discover", kind: "signal" });

  const [result, smsSent] = await Promise.all([
    notifications.pushEnabled
      ? sendPushToAll(db, { title, body, url: "/", tag: "mse-signal-change" })
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
