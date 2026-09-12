import type { Db } from "mongodb";
import type { Holding, OrderSide, Portfolio, Transaction } from "@/lib/types";

/**
 * Correcting an order after it was filled.
 *
 * An order is not a record of something that happened elsewhere — placing one
 * moved money out of `portfolios` and shares into `holdings`, and those two
 * collections are written alongside the history rather than derived from it.
 * So a row deleted or edited by hand leaves the account describing a trade the
 * history no longer contains.
 *
 * Neither can the account simply be recomputed from the history instead. A
 * broker statement sets the cash balance to a figure it was told and opens
 * positions that predate every row it imports; rebuilt from transactions
 * alone, an imported portfolio would come out wrong. What is reliable is the
 * *difference* a change makes, which is what this module states.
 *
 * The arithmetic is separated from the writing so it can be checked in cases
 * rather than against a database.
 */

export class OrderCorrectionError extends Error {}

/** As much of an order as the arithmetic depends on. */
export interface OrderLike {
  side: OrderSide;
  quantity: number;
  total: number;
}

/** What an order did to the account when it was filled. */
export interface Effect {
  /** Change in the cash balance. */
  cash: number;
  /** Change in the number of shares held. */
  shares: number;
  /** Change in the total amount paid for the shares held. */
  basis: number;
}

export interface AccountState {
  cash: number;
  held: number;
  avgCost: number;
}

const NOTHING: Effect = { cash: 0, shares: 0, basis: 0 };

/**
 * A buy spends cash and adds shares at what it paid. A sell returns cash and
 * takes shares out at the average the account is already carrying — which is
 * why it needs that average passed in, and why a sell leaves the average
 * exactly where it was. That is how the app fills them (`lib/portfolio.ts`
 * touches `avgCost` on a buy and never on a sell), so it is how undoing one
 * has to work: reverse a sell and the average must come back unchanged, not
 * diluted by shares reappearing at nothing.
 */
export function effectOf(order: OrderLike, avgCost: number): Effect {
  return order.side === "BUY"
    ? { cash: -order.total, shares: order.quantity, basis: order.total }
    : { cash: order.total, shares: -order.quantity, basis: -avgCost * order.quantity };
}

/**
 * The account with `before` never having happened and `after` having happened
 * instead. Either may be null: no `before` is an order being added, no `after`
 * one being removed, and both together are an edit.
 */
export function afterChange(
  state: AccountState,
  before: OrderLike | null,
  after: OrderLike | null,
): AccountState {
  const undone = before ? effectOf(before, state.avgCost) : NOTHING;
  const done = after ? effectOf(after, state.avgCost) : NOTHING;

  const held = state.held - undone.shares + done.shares;
  const basis = state.avgCost * state.held - undone.basis + done.basis;
  return {
    cash: state.cash - undone.cash + done.cash,
    held,
    // A holding of nothing has no average to quote. The floor at zero catches
    // the rounding that a chain of edits leaves behind — a basis of -0.004
    // should read as free, not as a negative price per share.
    avgCost: held > 0 ? Math.max(basis, 0) / held : 0,
  };
}

/**
 * Refuses a change that would leave the account describing something that
 * cannot be true. Both are the same fault seen from two sides: the correction
 * is being applied to a position that has already moved on without it.
 */
export function checkChange(next: AccountState, symbol: string): void {
  if (next.held < 0) {
    throw new OrderCorrectionError(
      `${symbol}: энэ өөрчлөлт хувьцааны үлдэгдлийг ${format(next.held)} болгож байна. ` +
        `Уг захиалгын дараа өөр арилжаа хийгдсэн байна.`,
    );
  }
  if (next.cash < 0) {
    throw new OrderCorrectionError(
      `Энэ өөрчлөлт мөнгөн үлдэгдлийг ${format(next.cash)}₮ болгож байна. ` +
        `Эхлээд үлдэгдлийг гараар тохируулна уу.`,
    );
  }
}

function format(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Reads what the change is being applied to. */
export async function readAccount(
  db: Db,
  userId: string,
  companyCode: number,
): Promise<AccountState> {
  const [portfolio, holding] = await Promise.all([
    db.collection<Portfolio>("portfolios").findOne({ userId }),
    db.collection<Holding>("holdings").findOne({ userId, companyCode }),
  ]);
  return {
    cash: portfolio?.cashBalance ?? 0,
    held: holding?.quantity ?? 0,
    avgCost: holding?.avgCost ?? 0,
  };
}

/**
 * Writes the account the change leaves behind. The transaction row itself is
 * the caller's to add, edit or remove — this is only the account it moved.
 */
export async function writeAccount(
  db: Db,
  userId: string,
  companyCode: number,
  symbol: string,
  next: AccountState,
): Promise<void> {
  const now = new Date();
  await db
    .collection<Portfolio>("portfolios")
    .updateOne(
      { userId },
      { $set: { cashBalance: next.cash, updatedAt: now }, $setOnInsert: { userId } },
      { upsert: true },
    );
  // A position that has gone is removed rather than left as a row of nothing:
  // the portfolio lists what is held, and a zero would list a company the
  // account no longer owns any of.
  if (next.held === 0) {
    await db.collection<Holding>("holdings").deleteOne({ userId, companyCode });
    return;
  }
  await db.collection<Holding>("holdings").updateOne(
    { userId, companyCode },
    {
      $set: { quantity: next.held, avgCost: next.avgCost, updatedAt: now },
      $setOnInsert: { userId, companyCode, symbol },
    },
    { upsert: true },
  );
}

/** Reads, computes, checks and writes — the whole of applying one change. */
export async function applyChange(
  db: Db,
  userId: string,
  companyCode: number,
  symbol: string,
  before: OrderLike | null,
  after: OrderLike | null,
): Promise<AccountState> {
  const state = await readAccount(db, userId, companyCode);
  const next = afterChange(state, before, after);
  checkChange(next, symbol);
  await writeAccount(db, userId, companyCode, symbol, next);
  return next;
}

/**
 * The order that cancels one out: the same shares at the same price, the other
 * way round. Kept as a row of its own rather than deleting the original, so
 * the history still says the trade was made and then undone.
 */
export function mirrorOf(tx: Transaction, at: Date = new Date()): Transaction {
  return {
    userId: tx.userId,
    companyCode: tx.companyCode,
    symbol: tx.symbol,
    side: tx.side === "BUY" ? "SELL" : "BUY",
    quantity: tx.quantity,
    price: tx.price,
    total: tx.total,
    createdAt: at,
    reversalOf: String(tx._id),
  };
}
