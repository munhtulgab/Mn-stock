import type { Db } from "mongodb";
import { getSettings } from "@/lib/settings";
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

export interface AdminOverview {
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
  latestOrders: RecentOrder[];
  latestUsers: { id: string; username: string; fullName: string | null; createdAt: Date | null }[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getAdminOverview(db: Db): Promise<AdminOverview> {
  const since = new Date(Date.now() - WEEK_MS);

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
      .find({}, { sort: { createdAt: -1 }, limit: 8 })
      .toArray(),
    db
      .collection<User>("users")
      .find({}, { sort: { createdAt: -1 }, limit: 5, projection: { username: 1, fullName: 1, createdAt: 1 } })
      .toArray(),
  ]);

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
    users: { total: users, admins, recent: recentUsers, sessions },
    orders: {
      total: (buys?.n ?? 0) + (sells?.n ?? 0),
      recent: recentOrders,
      buys: buys?.n ?? 0,
      sells: sells?.n ?? 0,
      turnover: (buys?.total ?? 0) + (sells?.total ?? 0),
    },
    alerts: { total: alerts, recent: recentAlerts, lastAt: lastAlert?.createdAt ?? null },
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
