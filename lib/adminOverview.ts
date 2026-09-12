import type { Db } from "mongodb";
import { getSettings } from "@/lib/settings";
import { ulaanbaatarDaysAgo } from "@/lib/day";
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
const STRIP_MS = STRIP_DAYS * DAY_MS;

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
    alerts,
    recentAlerts,
    lastAlert,
    settings,
    syncState,
    latestOrderDocs,
    latestUserDocs,
    dailyRows,
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
    db.collection<AppNotification>("notifications").countDocuments({}),
    db.collection<AppNotification>("notifications").countDocuments({ createdAt: { $gte: since } }),
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
    db
      .collection<Transaction>("transactions")
      .aggregate<{ _id: string; n: number; sum: number }>([
        { $match: { createdAt: { $gte: new Date(Date.now() - STRIP_MS) } } },
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
            sum: { $sum: "$total" },
          },
        },
      ])
      .toArray(),
  ]);

  // Every day in the window, including the quiet ones — a strip with gaps in
  // it reads as missing data rather than as a day nobody traded. An exchange
  // is shut two days in seven and on every public holiday, so a good third of
  // the window is legitimately empty and the shape depends on those blanks
  // being drawn.
  const byDay = new Map(dailyRows.map((r) => [r._id, r]));
  const daily: DailyOrders[] = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const day = ulaanbaatarDaysAgo(STRIP_DAYS - 1 - i);
    const row = byDay.get(day);
    return { day, count: row?.n ?? 0, turnover: row?.sum ?? 0 };
  });

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
    alerts: { total: alerts, recent: recentAlerts, lastAt: lastAlert?.createdAt ?? null },
    daily,
    system: {
      aiKeys: apiKeys,
      aiKeysPossible: 7,
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
