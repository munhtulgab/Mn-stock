import type { Db } from "mongodb";
import { getSettings } from "@/lib/settings";
import { ulaanbaatarDay, ulaanbaatarDaysAgo, weekdayIndex } from "@/lib/day";
import { notificationTally } from "@/lib/notifications";
import { PROVIDER_NAMES } from "@/lib/ai/providers/catalog";
import type { AppNotification, Session, Transaction, User } from "@/lib/types";

/**
 * What the admin overview counts.
 *
 * Accounts and the machinery around them, and nothing about the market. The
 * exchange has four pages of its own on the app side; repeating an index or a
 * price here would make this a second, worse version of them, and it is not
 * what anyone opens an admin page to find out.
 */

export interface RecentOrder {
  id: string;
  userId: string;
  username: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  total: number;
  createdAt: Date;
}

/** One day's worth of orders, for the activity strip on the dashboard. */
export interface DailyOrders {
  /** `YYYY-MM-DD` in Ulaanbaatar. */
  day: string;
  count: number;
  /** What changed hands that day, in tögrög. */
  turnover: number;
}

export interface AdminOverview {
  /** The window the `recent` figures were counted over. */
  windowDays: number;
  users: { total: number; admins: number; recent: number; sessions: number };
  orders: { total: number; recent: number; buys: number; sells: number; turnover: number };
  alerts: { total: number; recent: number; lastAt: Date | null };
  system: {
    aiKeys: number;
    aiKeysPossible: number;
    newsSources: number;
    pushEnabled: boolean;
    smsEnabled: boolean;
    lastSecuritiesSyncAt: Date | null;
    lastFullPriceSyncCompletedAt: Date | null;
  };
  daily: DailyOrders[];
  /**
   * The last seven days, day by day, for the sparkline behind each KPI.
   *
   * One array per tile and all four the same length, so a card can draw its
   * own week without knowing which day is which — the labels come from
   * `weekDays`, which is the same seven days in the same order.
   */
  week: {
    days: string[];
    users: number[];
    sessions: number[];
    orders: number[];
    alerts: number[];
  };
  /**
   * The same window `daily` covers, summed — what the orders digest states.
   *
   * Kept beside `daily` rather than derived from it because two of these
   * cannot be: which side an order was on is not in a day's total, and the
   * quarter before this one is not in the window at all.
   */
  quarter: {
    /** How many days the figures cover, so the card can say so. */
    days: number;
    buys: number;
    sells: number;
    /**
     * What the orders over the window came to, and what the ninety days
     * before them came to — which is what the change beside the figure is
     * measured against.
     */
    turnover: number;
    previousTurnover: number;
  };
  latestOrders: RecentOrder[];
  latestUsers: { id: string; username: string; fullName: string | null; createdAt: Date | null }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How far the activity strip looks back.
 *
 * A quarter. A year fitted, but at a column a day it fitted by making each
 * column two pixels wide, and the shape of a fortnight inside it could not be
 * read at all. Ninety days is long enough to hold a season and short enough
 * that a single busy Tuesday is still a column you can point at.
 */
const STRIP_DAYS = 90;
/**
 * Twice the window is fetched, so the quarter has something to be a change
 * from. Only the newer half is plotted; the older half is summed and thrown
 * away, which is one `$match` range wider on a pipeline that was already
 * grouping by day rather than a second query.
 */
const STRIP_MS = 2 * STRIP_DAYS * DAY_MS;

/** How many days the sparkline behind each KPI covers. */
const WEEK_DAYS = 7;

/**
 * A run of days in order, with the days nothing happened on drawn as zero.
 *
 * The gaps are the point. A sparkline built only from the days that have a
 * row in the database plots seven bars whatever week it is, silently sliding
 * a quiet Sunday up against a busy Friday as though they were neighbours.
 */
export function alignDays(
  days: readonly string[],
  counts: ReadonlyMap<string, number>,
): number[] {
  return days.map((day) => counts.get(day) ?? 0);
}

/**
 * The orders and the turnover of a run of days.
 *
 * Takes the run rather than a from/to pair, because `daily` is already every
 * day in order with the quiet ones filled in — so "this week" is its last
 * seven entries and "the week before" the seven before those, and neither has
 * to be recomputed against a calendar that has already been applied once.
 */
export function sumDays(
  days: readonly DailyOrders[],
): { orders: number; turnover: number } {
  let orders = 0;
  let turnover = 0;
  for (const day of days) {
    orders += day.count;
    turnover += day.turnover;
  }
  return { orders, turnover };
}

/**
 * Orders on each weekday of a run of days, Monday first.
 *
 * A quarter laid over one week. Ninety columns say what happened; seven say
 * what happens — that Thursday is the day this installation trades on and
 * Sunday is not a day at all — and the second is the question a profile like
 * this is being asked. Which is also why it is a sum over the whole window
 * and not the last seven days: one week of seven bars is seven days, and a
 * Tuesday that happened to be quiet would read as "Tuesdays are quiet".
 *
 * Monday first because that is where a Mongolian week starts. The array is
 * indexed the way it is drawn, so nothing downstream has to know that
 * `Date` counts from Sunday.
 */
export function byWeekday(days: readonly DailyOrders[]): number[] {
  const week = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) week[weekdayIndex(day.day)] += day.count;
  return week;
}

/**
 * A tally's whole total, and the part of it inside the window.
 *
 * `since` is a day rather than an instant because the tally is kept by day:
 * comparing `YYYY-MM-DD` strings is the same comparison as comparing the
 * dates, and it keeps the window's edge on the same boundary the counting
 * used.
 */
export function countTally(
  rows: readonly { day: string; n: number }[],
  since: string,
): { total: number; recent: number } {
  let total = 0;
  let recent = 0;
  for (const row of rows) {
    total += row.n;
    if (row.day >= since) recent += row.n;
  }
  return { total, recent };
}

/**
 * How many documents fell on each of the last `days` Ulaanbaatar days.
 *
 * By the day it happened where the reader is, not where the database is: a
 * registration at nine in the morning belongs to that morning whatever the
 * server's clock is set to. Same grouping the orders strip uses.
 */
async function dayCounts(
  db: Db,
  collection: string,
  days: number,
): Promise<Map<string, number>> {
  const rows = await db
    .collection(collection)
    .aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: new Date(Date.now() - days * DAY_MS) } } },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$createdAt",
              format: "%Y-%m-%d",
              timezone: "Asia/Ulaanbaatar",
            },
          },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/**
 * @param windowDays how far back "recent" reaches, which the period control
 *   on the page chooses. The counts themselves are totals and do not move
 *   with it; only the change beside each one does.
 */
export async function getAdminOverview(db: Db, windowDays = 7): Promise<AdminOverview> {
  const since = new Date(Date.now() - windowDays * DAY_MS);

  const [
    users,
    admins,
    recentUsers,
    sessions,
    orderTotals,
    recentOrders,
    alertDays,
    lastAlert,
    settings,
    syncState,
    latestOrderDocs,
    latestUserDocs,
    dailyRows,
    userDays,
    sessionDays,
  ] = await Promise.all([
    db.collection<User>("users").countDocuments({}),
    db.collection<User>("users").countDocuments({ role: "admin" }),
    db.collection<User>("users").countDocuments({ createdAt: { $gte: since } }),
    db.collection<Session>("sessions").countDocuments({ expiresAt: { $gte: new Date() } }),
    db
      .collection<Transaction>("transactions")
      .aggregate<{ _id: "BUY" | "SELL"; n: number; total: number }>([
        { $group: { _id: "$side", n: { $sum: 1 }, total: { $sum: "$total" } } },
      ])
      .toArray(),
    db.collection<Transaction>("transactions").countDocuments({ createdAt: { $gte: since } }),
    // Not `countDocuments` on the feed: it is trimmed to two hundred rows, so
    // that answered two hundred for ever once the cap was reached and the
    // dashboard showed a frozen figure with a meaningless change beside it.
    notificationTally(db),
    db
      .collection<AppNotification>("notifications")
      .find({}, { sort: { createdAt: -1 }, limit: 1, projection: { createdAt: 1 } })
      .next(),
    getSettings(db),
    db
      .collection<{
        key: string;
        lastSecuritiesSyncAt?: Date;
        lastFullPriceSyncCompletedAt?: Date;
      }>("syncState")
      .findOne({ key: "main" }),
    db
      .collection<Transaction>("transactions")
      .find({}, { sort: { createdAt: -1 }, limit: 15 })
      .toArray(),
    db
      .collection<User>("users")
      .find({}, { sort: { createdAt: -1 }, limit: 5, projection: { username: 1, fullName: 1, createdAt: 1 } })
      .toArray(),
    // Grouped by the Ulaanbaatar day rather than the server's: an order
    // filled at nine in the morning belongs to that trading day wherever the
    // database happens to be running.
    //
    // By side as well, so the digest's ring and its Захиалга tile are folded
    // out of one result over one window. Counted separately they were not:
    // this `$match` is ninety times twenty-four hours before *now* and lands
    // partway through a day, while the plotted window starts at the top of
    // one — so a split asked for on its own included a few orders the strip
    // beside it did not, and three tiles that should have added up did not.
    db
      .collection<Transaction>("transactions")
      .aggregate<{ _id: { day: string; side: "BUY" | "SELL" }; n: number; sum: number }>([
        { $match: { createdAt: { $gte: new Date(Date.now() - STRIP_MS) } } },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  date: "$createdAt",
                  format: "%Y-%m-%d",
                  timezone: "Asia/Ulaanbaatar",
                },
              },
              side: "$side",
            },
            n: { $sum: 1 },
            sum: { $sum: "$total" },
          },
        },
      ])
      .toArray(),
    // The other two tiles' weeks. Registrations and sign-ins are events with
    // a date on them, so they group the same way the orders above do; the
    // sessions tile shows its own count of live sessions, which is a level
    // rather than a flow, and what is drawn behind it is the sign-ins that
    // produced them.
    dayCounts(db, "users", WEEK_DAYS),
    dayCounts(db, "sessions", WEEK_DAYS),
  ]);

  // Every day in the window, including the quiet ones — a strip with gaps in
  // it reads as missing data rather than as a day nobody traded. An exchange
  // is shut two days in seven and on every public holiday, so a good third of
  // the window is legitimately empty and the shape depends on those blanks
  // being drawn.
  const byDay = new Map<string, { n: number; sum: number }>();
  for (const row of dailyRows) {
    const day = byDay.get(row._id.day) ?? { n: 0, sum: 0 };
    day.n += row.n;
    day.sum += row.sum;
    byDay.set(row._id.day, day);
  }
  const filled: DailyOrders[] = Array.from({ length: 2 * STRIP_DAYS }, (_, i) => {
    const day = ulaanbaatarDaysAgo(2 * STRIP_DAYS - 1 - i);
    const row = byDay.get(day);
    return { day, count: row?.n ?? 0, turnover: row?.sum ?? 0 };
  });
  // The quarter that is drawn, and the one behind it that only the change
  // beside the figure ever sees.
  const daily = filled.slice(STRIP_DAYS);
  const thisQuarter = sumDays(daily);
  const lastQuarter = sumDays(filled.slice(0, STRIP_DAYS));

  // The split, over exactly the days that are drawn.
  const plotted = new Set(daily.map((d) => d.day));
  let quarterBuys = 0;
  let quarterSells = 0;
  for (const row of dailyRows) {
    if (!plotted.has(row._id.day)) continue;
    if (row._id.side === "BUY") quarterBuys += row.n;
    else if (row._id.side === "SELL") quarterSells += row.n;
  }

  // The same seven days for every tile, so one row of labels describes all
  // four sparklines and a card never has to know which day a bar is.
  const weekDays = Array.from({ length: WEEK_DAYS }, (_, i) =>
    ulaanbaatarDaysAgo(WEEK_DAYS - 1 - i),
  );
  const alertsByDay = new Map(alertDays.map((r) => [r.day, r.n]));
  const ordersByDay = new Map(daily.map((d) => [d.day, d.count]));
  const alerts = countTally(alertDays, ulaanbaatarDay(since));

  // The names for the recent orders, asked for once rather than per row.
  const owners = await db
    .collection<User>("users")
    .find(
      { _id: { $in: latestOrderDocs.map((t) => t.userId) } } as never,
      { projection: { username: 1 } },
    )
    .toArray();
  const nameById = new Map(owners.map((u) => [String(u._id), u.username]));

  const buys = orderTotals.find((r) => r._id === "BUY");
  const sells = orderTotals.find((r) => r._id === "SELL");
  const apiKeys = Object.values(settings.apiKeys).filter(Boolean).length;

  return {
    windowDays,
    users: { total: users, admins, recent: recentUsers, sessions },
    orders: {
      total: (buys?.n ?? 0) + (sells?.n ?? 0),
      recent: recentOrders,
      buys: buys?.n ?? 0,
      sells: sells?.n ?? 0,
      turnover: (buys?.total ?? 0) + (sells?.total ?? 0),
    },
    alerts: {
      total: alerts.total,
      recent: alerts.recent,
      lastAt: lastAlert?.createdAt ?? null,
    },
    daily,
    week: {
      days: weekDays,
      users: alignDays(weekDays, userDays),
      sessions: alignDays(weekDays, sessionDays),
      orders: alignDays(weekDays, ordersByDay),
      alerts: alignDays(weekDays, alertsByDay),
    },
    quarter: {
      days: STRIP_DAYS,
      buys: quarterBuys,
      sells: quarterSells,
      turnover: thisQuarter.turnover,
      previousTurnover: lastQuarter.turnover,
    },
    system: {
      aiKeys: apiKeys,
      aiKeysPossible: PROVIDER_NAMES.length,
      newsSources: settings.newsSources.length,
      pushEnabled: settings.notifications.pushEnabled,
      smsEnabled: settings.sms.enabled,
      lastSecuritiesSyncAt: syncState?.lastSecuritiesSyncAt ?? null,
      lastFullPriceSyncCompletedAt: syncState?.lastFullPriceSyncCompletedAt ?? null,
    },
    latestOrders: latestOrderDocs.map((t) => ({
      id: String(t._id),
      userId: t.userId,
      username: nameById.get(t.userId) ?? "—",
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      total: t.total,
      createdAt: t.createdAt,
    })),
    latestUsers: latestUserDocs.map((u) => ({
      id: String(u._id),
      username: u.username,
      fullName: u.fullName ?? null,
      createdAt: u.createdAt ?? null,
    })),
  };
}

/**
 * The figures the bar shows beside Хэрэглэгч and Захиалга.
 *
 * Two counts, read on every admin page because the bar is on every admin
 * page — the price of numbers that save an administrator from clicking
 * through to find out whether anything has arrived. Only those two: a tally
 * beside Хяналт would be a tally of nothing in particular, and beside Систем
 * there is nothing to count.
 */
export async function countSections(db: Db): Promise<Record<string, number>> {
  const [users, orders] = await Promise.all([
    db.collection<User>("users").countDocuments({}),
    // Estimated: this is a tally beside a nav label, not a figure anyone
    // reconciles, and an exact count of a collection that only grows is a
    // full scan on every admin page.
    db.collection<Transaction>("transactions").estimatedDocumentCount(),
  ]);
  return { "/admin/users": users, "/admin/orders": orders };
}
