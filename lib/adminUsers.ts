import { ObjectId, type Db, type Filter } from "mongodb";
import { founderId } from "@/lib/roles";
import type {
  Holding,
  Portfolio,
  Session,
  Transaction,
  User,
  UserRole,
  WatchlistItem,
} from "@/lib/types";

/**
 * What the admin area needs to know about the people using the installation.
 *
 * Deliberately no prices in any of it. An administrator is looking after
 * accounts, not at the market — the market has four pages of its own on the
 * other side of the app, and a holding shown here is a number of shares and
 * what was paid for them, never what it is worth this morning.
 */

export interface AdminUserRow {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  role: UserRole;
  /** The first account opened, which is an administrator come what may. */
  founder: boolean;
  createdAt: Date | null;
  orderCount: number;
  positionCount: number;
  cash: number;
}

/** Everyone, with the account figures the list shows against each name. */
export async function listUsers(db: Db, query?: string): Promise<AdminUserRow[]> {
  const filter: Filter<User> = query
    ? {
        $or: [
          { username: { $regex: escapeRegex(query), $options: "i" } },
          { fullName: { $regex: escapeRegex(query), $options: "i" } },
          { email: { $regex: escapeRegex(query), $options: "i" } },
          { phone: { $regex: escapeRegex(query), $options: "i" } },
        ],
      }
    : {};

  // Four queries whatever the number of accounts, rather than three per
  // account. The two tallies come back grouped and are matched up here.
  const [users, founder, orderCounts, positionCounts, portfolios] = await Promise.all([
    db.collection<User>("users").find(filter).sort({ createdAt: 1, _id: 1 }).toArray(),
    founderId(db),
    countBy(db, "transactions"),
    countBy(db, "holdings"),
    db.collection<Portfolio>("portfolios").find({}).toArray(),
  ]);
  const cashByUser = new Map(portfolios.map((p) => [p.userId, p.cashBalance]));

  return users.map((user) => {
    const id = String(user._id);
    return {
      id,
      username: user.username,
      fullName: user.fullName ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      avatar: user.avatar ?? null,
      role: user.role === "admin" || id === founder ? "admin" : "user",
      founder: id === founder,
      createdAt: user.createdAt ?? null,
      orderCount: orderCounts.get(id) ?? 0,
      positionCount: positionCounts.get(id) ?? 0,
      cash: cashByUser.get(id) ?? 0,
    };
  });
}

async function countBy(db: Db, collection: string): Promise<Map<string, number>> {
  const rows = await db
    .collection(collection)
    .aggregate<{ _id: string; n: number }>([{ $group: { _id: "$userId", n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

export interface AdminHoldingRow {
  companyCode: number;
  symbol: string;
  quantity: number;
  avgCost: number;
}

export interface AdminOrderRow {
  id: string;
  companyCode: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  createdAt: Date;
  /** From the statement importer, which owns and rebuilds its own rows. */
  imported: boolean;
  /** This row cancels out the order with that id. */
  reversalOf: string | null;
  /** This row has already been cancelled out by a later one. */
  reversedBy: string | null;
  editedAt: Date | null;
}

export interface AdminUserDetail extends AdminUserRow {
  holdings: AdminHoldingRow[];
  orders: AdminOrderRow[];
  sessions: number;
}

/** One account in full: who they are, what they hold, what they have traded. */
export async function getUserDetail(db: Db, id: string): Promise<AdminUserDetail | null> {
  const user = await db.collection<User>("users").findOne({ _id: id } as never);
  if (!user) return null;

  const [founder, holdings, transactions, portfolio, sessions] = await Promise.all([
    founderId(db),
    db.collection<Holding>("holdings").find({ userId: id }).sort({ symbol: 1 }).toArray(),
    db
      .collection<Transaction>("transactions")
      .find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray(),
    db.collection<Portfolio>("portfolios").findOne({ userId: id }),
    db.collection<Session>("sessions").countDocuments({ userId: id }),
  ]);

  // Which orders have already been undone, so the page can say so and not
  // offer to undo them twice.
  const reversedBy = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.reversalOf) reversedBy.set(tx.reversalOf, String(tx._id));
  }

  return {
    id,
    username: user.username,
    fullName: user.fullName ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    avatar: user.avatar ?? null,
    role: user.role === "admin" || id === founder ? "admin" : "user",
    founder: id === founder,
    createdAt: user.createdAt ?? null,
    orderCount: transactions.length,
    positionCount: holdings.length,
    cash: portfolio?.cashBalance ?? 0,
    sessions,
    holdings: holdings.map((h) => ({
      companyCode: h.companyCode,
      symbol: h.symbol,
      quantity: h.quantity,
      avgCost: h.avgCost,
    })),
    orders: transactions.map((tx) => ({
      id: String(tx._id),
      companyCode: tx.companyCode,
      symbol: tx.symbol,
      side: tx.side,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      createdAt: tx.createdAt,
      imported: Boolean(tx.source),
      reversalOf: tx.reversalOf ?? null,
      reversedBy: reversedBy.get(String(tx._id)) ?? null,
      editedAt: tx.editedAt ?? null,
    })),
  };
}

/**
 * Everything an account owns, gone with it.
 *
 * Five collections key off the user id and none of them cascade on their own,
 * so a deleted account otherwise leaves its orders, its positions and — the
 * one that matters — its live sessions behind. Push subscriptions are not
 * among them: those belong to a browser rather than to an account.
 */
export async function deleteUserEverywhere(db: Db, id: string): Promise<void> {
  await Promise.all([
    db.collection<Transaction>("transactions").deleteMany({ userId: id }),
    db.collection<Holding>("holdings").deleteMany({ userId: id }),
    db.collection<Portfolio>("portfolios").deleteMany({ userId: id }),
    db.collection<WatchlistItem>("watchlist").deleteMany({ userId: id }),
    db.collection<Session>("sessions").deleteMany({ userId: id }),
  ]);
  await db.collection<User>("users").deleteOne({ _id: id } as never);
}

/**
 * Matches one order however its id was stored.
 *
 * Orders are inserted without an `_id`, so the driver assigns an ObjectId —
 * but the importer's rows and anything written by an older script may carry a
 * plain string. Querying for only one of the two silently finds nothing.
 */
export function orderFilter(id: string): Filter<Transaction> {
  const ids: unknown[] = [id];
  if (ObjectId.isValid(id) && /^[0-9a-f]{24}$/i.test(id)) {
    ids.push(ObjectId.createFromHexString(id));
  }
  return { _id: { $in: ids } } as Filter<Transaction>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface AdminOrderListRow extends AdminOrderRow {
  userId: string;
  username: string;
}

export interface AdminOrderPage {
  rows: AdminOrderListRow[];
  total: number;
  page: number;
  pages: number;
  size: number;
}

/** How many orders a page of the list holds. */
export const ORDERS_PER_PAGE = 50;

/**
 * Every order on the installation, newest first.
 *
 * Paged rather than capped. The account pages take the last five hundred of
 * one person's history because that is all one person has; this is everyone's,
 * and an installation two years old has more of them than anybody wants in
 * one response. A page number in the URL is also the only way to reach the
 * old ones at all.
 *
 * Filtering by symbol is offered because "what happened in QPAY" is the
 * question this page gets asked, and scanning fifty rows at a time for it is
 * not an answer.
 */
export async function listOrders(
  db: Db,
  { page = 1, symbol }: { page?: number; symbol?: string } = {},
): Promise<AdminOrderPage> {
  const filter: Filter<Transaction> = symbol ? { symbol: symbol.toUpperCase() } : {};
  const [total, docs] = await Promise.all([
    db.collection<Transaction>("transactions").countDocuments(filter),
    db
      .collection<Transaction>("transactions")
      .find(filter, {
        sort: { createdAt: -1 },
        skip: (page - 1) * ORDERS_PER_PAGE,
        limit: ORDERS_PER_PAGE,
      })
      .toArray(),
  ]);

  // The names for this page's rows, asked for once rather than per row.
  const owners = await db
    .collection<User>("users")
    .find({ _id: { $in: docs.map((t) => t.userId) } } as never, {
      projection: { username: 1 },
    })
    .toArray();
  const nameById = new Map(owners.map((u) => [String(u._id), u.username]));

  return {
    total,
    page,
    size: ORDERS_PER_PAGE,
    pages: Math.max(1, Math.ceil(total / ORDERS_PER_PAGE)),
    rows: docs.map((tx) => ({
      id: String(tx._id),
      userId: tx.userId,
      // An order whose account has been deleted keeps its row; the history is
      // the installation's, not only the account's.
      username: nameById.get(tx.userId) ?? "устсан",
      companyCode: tx.companyCode,
      symbol: tx.symbol,
      side: tx.side,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      createdAt: tx.createdAt,
      imported: Boolean(tx.source),
      reversalOf: tx.reversalOf ?? null,
      reversedBy: null,
      editedAt: tx.editedAt ?? null,
    })),
  };
}
