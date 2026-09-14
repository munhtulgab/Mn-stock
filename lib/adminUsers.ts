import { ObjectId, type Db, type Document, type Filter } from "mongodb";
import { founderId } from "@/lib/roles";
import { rangeSince } from "@/lib/adminFilters";
import { valuePortfolio } from "@/lib/portfolio";
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
 * The list is prices-free: it is a list of people, and valuing every account
 * to draw one line each would price the whole installation on every keystroke
 * of the search box. One account opened in full is valued, because the first
 * question asked about an account is what is in it, and a position stated
 * only as shares and average cost does not answer it.
 *
 * That valuation is the account holder's own — `valuePortfolio`, the same
 * function behind their portfolio page — so the two figures agree rather than
 * having to be reconciled.
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

/** What the list can be narrowed by. See `lib/adminFilters.ts` for the words. */
export interface UserFilters {
  /** Name, username, e-mail or phone. */
  q?: string;
  /** "admin" or "user", as the list reckons it rather than as stored. */
  role?: string;
  /** A `RANGES` value: how recently the account was opened. */
  joined?: string;
  /** "with" or "without": whether the account has ever placed an order. */
  activity?: string;
}

/**
 * Everyone, with the account figures the list shows against each name.
 *
 * The query and the registration date are asked of the database; the role and
 * whether the account has traded are applied afterwards, to the rows this
 * function has already built. That is not laziness on either count:
 *
 *  - The role shown is not the role stored. An account with no `role` field
 *    is an ordinary reader, and the first account ever opened is an
 *    administrator whatever its document says — see `founderId`. Asking Mongo
 *    for `role: "admin"` would disagree with the pill printed beside the name.
 *  - The order count is a tally over another collection that this function
 *    already has to build in full for the column. Turning it into a query
 *    would be a second pass over the same rows to learn the same thing.
 */
export async function listUsers(
  db: Db,
  filters: UserFilters = {},
): Promise<AdminUserRow[]> {
  const { q, role, joined, activity } = filters;
  const terms: Filter<User>[] = [];
  if (q) {
    terms.push({
      $or: [
        { username: { $regex: escapeRegex(q), $options: "i" } },
        { fullName: { $regex: escapeRegex(q), $options: "i" } },
        { email: { $regex: escapeRegex(q), $options: "i" } },
        { phone: { $regex: escapeRegex(q), $options: "i" } },
      ],
    });
  }
  const since = rangeSince(joined ?? "");
  if (since) terms.push({ createdAt: { $gte: since } });
  const filter: Filter<User> = terms.length > 0 ? { $and: terms } : {};

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

  const rows: AdminUserRow[] = users.map((user) => {
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

  return rows.filter(
    (row) =>
      (!role || row.role === role) &&
      (!activity ||
        (activity === "with" ? row.orderCount > 0 : row.orderCount === 0)),
  );
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
  /** Null when nothing has ever been published for the company. */
  currentPrice: number | null;
  /** Valued at `currentPrice`, or at cost while no price is known. */
  marketValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPct: number | null;
}

/** What the account is worth, and what it cost to get there. */
export interface AdminValuation {
  /** Cash plus positions. */
  totalValue: number;
  holdingsValue: number;
  /** What was paid for the positions still held. */
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPct: number | null;
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
  valuation: AdminValuation;
}

/** One account in full: who they are, what they hold, what they have traded. */
export async function getUserDetail(db: Db, id: string): Promise<AdminUserDetail | null> {
  const user = await db.collection<User>("users").findOne({ _id: id } as never);
  if (!user) return null;

  const [founder, holdings, transactions, portfolio, sessions] = await Promise.all([
    founderId(db),
    db
      .collection<Holding>("holdings")
      .find({ userId: id, quantity: { $gt: 0 } })
      .sort({ symbol: 1 })
      .toArray(),
    db
      .collection<Transaction>("transactions")
      .find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray(),
    db.collection<Portfolio>("portfolios").findOne({ userId: id }),
    db.collection<Session>("sessions").countDocuments({ userId: id }),
  ]);

  const cash = portfolio?.cashBalance ?? 0;
  const valued = await valuePortfolio(db, holdings, cash);
  const valuedByCode = new Map(valued.holdings.map((h) => [h.companyCode, h]));

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
    cash,
    sessions,
    valuation: {
      totalValue: valued.totalValue,
      holdingsValue: valued.holdingsValue,
      totalCostBasis: valued.totalCostBasis,
      totalGainLoss: valued.totalGainLoss,
      totalGainLossPct: valued.totalGainLossPct,
    },
    holdings: holdings.map((h) => {
      const v = valuedByCode.get(h.companyCode);
      const costBasis = h.avgCost * h.quantity;
      return {
        companyCode: h.companyCode,
        symbol: h.symbol,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice: v?.currentPrice ?? null,
        marketValue: v?.marketValue ?? costBasis,
        costBasis,
        gainLoss: v?.gainLoss ?? 0,
        gainLossPct: v?.gainLossPct ?? null,
      };
    }),
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
 * What each mark means as a query.
 *
 * "Аппаас хийсэн" is the absence of a `source` rather than a value of it —
 * rows written by the app itself never carry one — so it is spelled as the
 * two ways absence is stored, not as a negation that would also drop every
 * row where the field is an empty string.
 */
const MARK_FILTERS: Record<string, Document> = {
  imported: { source: { $exists: true, $nin: [null, ""] } },
  manual: { $or: [{ source: { $exists: false } }, { source: { $in: [null, ""] } }] },
  reversal: { reversalOf: { $exists: true, $nin: [null, ""] } },
  edited: { editedAt: { $exists: true, $ne: null } },
};

/** What the order list can be narrowed by. See `lib/adminFilters.ts`. */
export interface OrderFilters {
  page?: number;
  /** A ticker or an account name — the two things a row is looked up by. */
  q?: string;
  /** "BUY" or "SELL". */
  side?: string;
  /** A `RANGES` value: how recently the order was placed. */
  days?: string;
  /** An `ORDER_MARKS` value: how the row got here. */
  mark?: string;
}

/**
 * Every order on the installation, newest first.
 *
 * Paged rather than capped. The account pages take the last five hundred of
 * one person's history because that is all one person has; this is everyone's,
 * and an installation two years old has more of them than anybody wants in
 * one response. A page number in the URL is also the only way to reach the
 * old ones at all.
 *
 * The query matches a ticker or an account name, because those are the two
 * ways a row is looked for and an administrator holding one of them should
 * not have to say which they are holding. Names cost a second query — the
 * accounts collection is asked which ids match before the orders are asked
 * for at all — and that is the price of one box instead of two.
 *
 * Filters are `$and`ed rather than merged into one object: the query already
 * uses `$or`, and a second `$or` written into the same object at the top
 * level would silently replace the first.
 */
export async function listOrders(
  db: Db,
  { page = 1, q, side, days, mark }: OrderFilters = {},
): Promise<AdminOrderPage> {
  const terms: Filter<Transaction>[] = [];

  if (q) {
    const named = await db
      .collection<User>("users")
      .find({ username: { $regex: escapeRegex(q), $options: "i" } }, { projection: { _id: 1 } })
      .toArray();
    terms.push({
      $or: [
        { symbol: { $regex: escapeRegex(q), $options: "i" } },
        { userId: { $in: named.map((u) => String(u._id)) } },
      ],
    } as Filter<Transaction>);
  }
  if (side === "BUY" || side === "SELL") terms.push({ side });
  const since = rangeSince(days ?? "");
  if (since) terms.push({ createdAt: { $gte: since } });
  if (mark) terms.push((MARK_FILTERS[mark] ?? {}) as Filter<Transaction>);

  const filter: Filter<Transaction> = terms.length > 0 ? { $and: terms } : {};
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
