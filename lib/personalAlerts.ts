import type { Db } from "mongodb";
import { recordNotifications } from "@/lib/notifications";
import { sendPushToUsers, type NotificationPayload } from "@/lib/push";
import { getSettings } from "@/lib/settings";
import { ulaanbaatarDay, ulaanbaatarDaysAgo } from "@/lib/day";
import { SIGNAL_LABELS, type Holding, type Signal, type WatchlistItem } from "@/lib/types";

/**
 * Alerts about the companies a reader holds or watches, sent to that reader.
 *
 * Everything the app announced before this went to everybody: a signal
 * change anywhere on the exchange, every headline, one push to every device.
 * That is the right shape for the market and the wrong one for a portfolio.
 * Somebody holding APU learned that APU had turned only if it happened to be
 * one of the transitions the operator had chosen to interrupt everyone with,
 * summarised as "12 дохио шинэчлэгдлээ" alongside eleven companies they had
 * never looked at — and a six per cent fall in their own position was not an
 * alert at all.
 *
 * A company's own news — its signal turning, its price moving hard — is told
 * only to the readers who hold or watch it:
 *
 *  - a signal change: a row in their feed every time, and a push for the
 *    transitions the operator ticked in the settings;
 *  - a move of five per cent or more in a session, once a day in each
 *    direction.
 *
 * Market news is different and goes to everybody — see `announce` in
 * lib/marketNews.ts.
 *
 * "Their" companies are the ones they hold (a position above nothing) and
 * the ones on their watchlist. Holding wins where both apply, because it is
 * the stronger reason to be told and the alert says which it is.
 */

/** A move this large in one session is worth interrupting a holder for. */
export const PRICE_ALERT_PCT = 5;

/**
 * A session further back than this is history rather than news. Without it
 * the first run after a gap — a holiday, a broken sync — would announce a
 * week-old fall as if it had just happened.
 */
const MAX_SESSION_AGE_DAYS = 4;

export type Relation = "holds" | "watches";

type Follow = { userId: string; companyCode: number };

/**
 * Who follows which company, and how. Pure, so the precedence is testable:
 * a reader who both holds and watches a company holds it.
 */
export function followersFrom(
  holdings: Follow[],
  watching: Follow[],
): Map<number, Map<string, Relation>> {
  const out = new Map<number, Map<string, Relation>>();
  const add = ({ userId, companyCode }: Follow, relation: Relation) => {
    const users = out.get(companyCode) ?? new Map<string, Relation>();
    if (users.get(userId) !== "holds") users.set(userId, relation);
    out.set(companyCode, users);
  };
  for (const w of watching) add(w, "watches");
  for (const h of holdings) add(h, "holds");
  return out;
}

export async function followersOf(
  db: Db,
  companyCodes: number[],
): Promise<Map<number, Map<string, Relation>>> {
  if (companyCodes.length === 0) return new Map();
  const [holdings, watching] = await Promise.all([
    db
      .collection<Holding>("holdings")
      .find(
        { companyCode: { $in: companyCodes }, quantity: { $gt: 0 } },
        { projection: { _id: 0, userId: 1, companyCode: 1 } },
      )
      .toArray(),
    db
      .collection<WatchlistItem>("watchlist")
      .find(
        { companyCode: { $in: companyCodes } },
        { projection: { _id: 0, userId: 1, companyCode: 1 } },
      )
      .toArray(),
  ]);
  return followersFrom(holdings, watching);
}

/** Groups items by the readers who follow them, keeping how each follows. */
function byReader<T extends { companyCode: number }>(
  items: T[],
  followers: Map<number, Map<string, Relation>>,
): Map<string, { item: T; relation: Relation }[]> {
  const out = new Map<string, { item: T; relation: Relation }[]>();
  for (const item of items) {
    for (const [userId, relation] of followers.get(item.companyCode) ?? []) {
      const list = out.get(userId) ?? [];
      list.push({ item, relation });
      out.set(userId, list);
    }
  }
  return out;
}

const whose = (relation: Relation) =>
  relation === "holds" ? "Таны багцад байгаа" : "Таны хянаж буй";

async function pushEach(
  db: Db,
  perReader: Map<string, NotificationPayload>,
): Promise<number> {
  const { notifications } = await getSettings(db);
  // The operator's master switch still applies: off means no device is
  // interrupted by this installation, for anybody's reasons.
  if (!notifications.pushEnabled) return 0;
  let sent = 0;
  await Promise.all(
    [...perReader].map(async ([userId, payload]) => {
      const result = await sendPushToUsers(db, [userId], payload).catch((err) => {
        console.error("personal push failed", err);
        return null;
      });
      sent += result?.sent ?? 0;
    }),
  );
  return sent;
}

/* ---------------------------------------------------------------- signals */

export interface FollowedSignalChange {
  companyCode: number;
  symbol: string;
  name: string;
  from: Signal;
  to: Signal;
}

/**
 * A signal change on a company a reader follows, told to that reader — and
 * to nobody else. This is the only place a signal change is announced.
 *
 * Every move goes into the follower's own feed. Which of them also buzz a
 * phone is the operator's choice (`pushFor`, the transitions ticked in the
 * settings): a move to ХҮЛЭЭХ is worth a row a reader can find, and not
 * necessarily worth interrupting them for.
 */
export async function notifyFollowersOfSignals(
  db: Db,
  changes: FollowedSignalChange[],
  pushFor: readonly Signal[] = ["BUY", "SELL", "HOLD"],
): Promise<{ readers: number; pushed: number }> {
  if (changes.length === 0) return { readers: 0, pushed: 0 };
  const followers = await followersOf(db, changes.map((c) => c.companyCode));
  const perReader = byReader(changes, followers);
  if (perReader.size === 0) return { readers: 0, pushed: 0 };

  await recordNotifications(
    db,
    [...perReader].flatMap(([userId, theirs]) =>
      theirs.map(({ item: c, relation }) => ({
        kind: "signal" as const,
        userId,
        mine: relation,
        symbol: c.symbol,
        signal: c.to,
        previousSignal: c.from,
        title: `${c.symbol}: ${SIGNAL_LABELS[c.to]} дохио`,
        body: `${whose(relation)} ${c.name} — ${SIGNAL_LABELS[c.from]} байснаа ${SIGNAL_LABELS[c.to]} боллоо`,
        url: `/stock/${c.symbol}`,
      })),
    ),
  );

  const payloads = new Map<string, NotificationPayload>();
  for (const [userId, all] of perReader) {
    const theirs = all.filter(({ item }) => pushFor.includes(item.to));
    if (theirs.length === 1) {
      const [{ item: c, relation }] = theirs;
      payloads.set(userId, {
        title: `${c.symbol}: ${SIGNAL_LABELS[c.to]} дохио`,
        body: `${whose(relation)} ${c.name} — ${SIGNAL_LABELS[c.from]} байснаа ${SIGNAL_LABELS[c.to]} боллоо`,
        url: `/stock/${c.symbol}`,
        tag: `mine-signal-${c.symbol}`,
      });
    } else if (theirs.length > 1) {
      payloads.set(userId, {
        title: `Таны ${theirs.length} хувьцааны дохио өөрчлөгдлөө`,
        body: theirs
          .slice(0, 5)
          .map(({ item: c }) => `${c.symbol} ${SIGNAL_LABELS[c.to]}`)
          .join(", "),
        url: "/notifications",
        tag: "mine-signal",
      });
    }
  }
  const pushed = await pushEach(db, payloads);
  return { readers: perReader.size, pushed };
}

/* ------------------------------------------------------------ price moves */

export interface PriceMove {
  companyCode: number;
  symbol: string;
  name?: string;
  price: number | null;
  changePct: number | null;
  /** The session the move happened in, `YYYY-MM-DD` in Ulaanbaatar. */
  day: string;
}

export type BigMove = PriceMove & { changePct: number; direction: "up" | "down" };

/** The moves large enough to tell someone about, and which way they went. */
export function bigMoves(moves: PriceMove[], threshold = PRICE_ALERT_PCT): BigMove[] {
  return moves
    .filter(
      (m): m is PriceMove & { changePct: number } =>
        m.changePct !== null &&
        Number.isFinite(m.changePct) &&
        Math.abs(m.changePct) >= threshold,
    )
    .map((m) => ({ ...m, direction: m.changePct > 0 ? ("up" as const) : ("down" as const) }));
}

/**
 * The key a move is announced under: one alert per company, per session, per
 * direction. The intraday check and the evening sync both look at the same
 * move — the first from the live feed, the second from the stored close —
 * and whichever sees it first is the one that tells people. A company that
 * rises six per cent and then closes five down has done two things, and is
 * told twice.
 */
export function moveKey(move: Pick<BigMove, "day" | "companyCode" | "direction">): string {
  return `${move.day}:${move.companyCode}:${move.direction}`;
}

const pct = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
const tugrug = (n: number) =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}₮`;

/**
 * A large move in a company a reader follows: a row in their own feed and a
 * push to their own devices.
 *
 * Called with every quote the price tick sees during a session and with the
 * latest session's closes after the evening sync, and says each move once —
 * see {@link moveKey}. The claim is an insert on `_id`, which is unique
 * whatever indexes exist, so two ticks arriving together cannot both win.
 */
export async function notifyPriceMoves(
  db: Db,
  moves: PriceMove[],
  now: Date = new Date(),
): Promise<{ announced: number; readers: number }> {
  const oldest = ulaanbaatarDaysAgo(MAX_SESSION_AGE_DAYS);
  const big = bigMoves(moves).filter((m) => m.day >= oldest);
  if (big.length === 0) return { announced: 0, readers: 0 };

  const followers = await followersOf(db, big.map((m) => m.companyCode));
  const followed = big.filter((m) => (followers.get(m.companyCode)?.size ?? 0) > 0);
  if (followed.length === 0) return { announced: 0, readers: 0 };

  const claims = db.collection<{ _id: string; at: Date }>("priceAlerts");
  const claimed: BigMove[] = [];
  for (const move of followed) {
    try {
      await claims.insertOne({ _id: moveKey(move), at: now });
      claimed.push(move);
    } catch (err) {
      // Duplicate key: somebody already announced this move. Anything else
      // is a real failure, and failing quiet here would only mean a missed
      // alert — so it is logged and the move is skipped.
      if ((err as { code?: number }).code !== 11000) {
        console.error("price alert claim failed", err);
      }
    }
  }
  if (claimed.length === 0) return { announced: 0, readers: 0 };

  // Names for any the caller could not supply — the live feed carries none.
  const unnamed = claimed.filter((m) => !m.name).map((m) => m.companyCode);
  const names = new Map<number, string>();
  if (unnamed.length > 0) {
    const rows = await db
      .collection<{ companyCode: number; name?: string }>("securities")
      .find({ companyCode: { $in: unnamed } }, { projection: { _id: 0, companyCode: 1, name: 1 } })
      .toArray();
    for (const r of rows) if (r.name) names.set(r.companyCode, r.name);
  }
  const nameOf = (m: BigMove) => m.name ?? names.get(m.companyCode) ?? m.symbol;

  const today = ulaanbaatarDay(now);
  const when = (m: BigMove) => (m.day === today ? "өнөөдөр" : `${m.day}-нд`);
  const verb = (m: BigMove) => (m.direction === "up" ? "өслөө" : "буурлаа");
  const detail = (m: BigMove, relation: Relation) =>
    [
      `${nameOf(m)} ${when(m)} ${verb(m)}`,
      m.price !== null ? tugrug(m.price) : null,
      relation === "holds" ? "таны багцад" : "таны хяналтад",
    ]
      .filter(Boolean)
      .join(" · ");

  const perReader = byReader(claimed, followers);

  await recordNotifications(
    db,
    [...perReader].flatMap(([userId, theirs]) =>
      theirs.map(({ item: m, relation }) => ({
        kind: "price" as const,
        userId,
        mine: relation,
        symbol: m.symbol,
        changePct: m.changePct,
        title: `${m.symbol} ${pct(m.changePct)}`,
        body: detail(m, relation),
        url: `/stock/${m.symbol}`,
      })),
    ),
  );

  const payloads = new Map<string, NotificationPayload>();
  for (const [userId, theirs] of perReader) {
    if (theirs.length === 1) {
      const [{ item: m, relation }] = theirs;
      payloads.set(userId, {
        title: `${m.symbol} ${pct(m.changePct)}`,
        body: detail(m, relation),
        url: `/stock/${m.symbol}`,
        tag: `mine-price-${m.symbol}`,
      });
    } else {
      payloads.set(userId, {
        title: `Таны ${theirs.length} хувьцаа огцом хөдөллөө`,
        body: theirs
          .slice(0, 5)
          .map(({ item: m }) => `${m.symbol} ${pct(m.changePct)}`)
          .join(", "),
        url: "/notifications",
        tag: "mine-price",
      });
    }
  }
  await pushEach(db, payloads);

  return { announced: claimed.length, readers: perReader.size };
}
