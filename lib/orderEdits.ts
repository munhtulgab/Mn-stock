import type { Db } from "mongodb";
import type { OrderSide, Transaction } from "@/lib/types";

/**
 * What an administrator did to somebody's order, kept beside the order.
 *
 * An edit used to leave `editedAt` and `editedBy` on the row and nothing
 * else: the page could say ЗАССАН, but not what had been changed or from
 * what, and the account holder's own history said nothing at all — their
 * order simply read differently from how they placed it. A deletion left
 * less than that: the row went, and with it any sign there had been one.
 *
 * So each correction is written down here, the order as it stood and as it
 * was left. It is its own collection rather than an array on the order
 * because a deleted order has no row left to hang it on, and that is the
 * correction most worth being able to see.
 */

/** The parts of an order a correction can change. */
export interface OrderSnapshot {
  side: OrderSide;
  quantity: number;
  price: number;
  total: number;
  createdAt: Date;
}

export type OrderEditAction = "edit" | "reverse" | "delete";

export interface OrderEdit {
  userId: string;
  /** The order corrected; for a reversal, the order that was undone. */
  orderId: string;
  companyCode: number;
  symbol: string;
  action: OrderEditAction;
  at: Date;
  /** The administrator's username. */
  by: string;
  before: OrderSnapshot;
  /** As it was left: absent for a deletion, the correcting order for a reversal. */
  after: OrderSnapshot | null;
}

export function snapshotOf(
  order: Pick<Transaction, "side" | "quantity" | "price" | "total" | "createdAt">,
): OrderSnapshot {
  return {
    side: order.side,
    quantity: order.quantity,
    price: order.price,
    total: order.total,
    createdAt: order.createdAt,
  };
}

const COLLECTION = "orderEdits";

export async function recordOrderEdit(db: Db, edit: OrderEdit): Promise<void> {
  await db.collection<OrderEdit>(COLLECTION).insertOne(edit);
}

/** An account's corrections, newest first. */
export async function editsForUser(db: Db, userId: string, limit = 500): Promise<OrderEdit[]> {
  const rows = await db
    .collection<OrderEdit>(COLLECTION)
    .find({ userId }, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  return rows;
}

/** The corrections made to these orders, newest first. */
export async function editsForOrders(db: Db, orderIds: string[]): Promise<OrderEdit[]> {
  if (orderIds.length === 0) return [];
  return db
    .collection<OrderEdit>(COLLECTION)
    .find({ orderId: { $in: orderIds } }, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .toArray();
}

/** One field that a correction moved, as the history states it. */
export interface OrderChange {
  label: string;
  from: string;
  to: string;
}

const money = (value: number) =>
  `${value.toLocaleString("mn-MN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₮`;
const sideName = (side: OrderSide) => (side === "BUY" ? "Авсан" : "Зарсан");

/**
 * What an edit changed, field by field, leaving out what it did not.
 *
 * Takes the time formatter rather than importing one so this stays free of
 * anything but plain data and can be read on either side of the network.
 */
export function changesOf(
  before: OrderSnapshot,
  after: OrderSnapshot,
  formatTime: (at: Date) => string,
): OrderChange[] {
  const changes: OrderChange[] = [];
  if (before.side !== after.side) {
    changes.push({ label: "Төрөл", from: sideName(before.side), to: sideName(after.side) });
  }
  if (before.quantity !== after.quantity) {
    changes.push({
      label: "Тоо",
      from: `${before.quantity.toLocaleString("mn-MN")} ш`,
      to: `${after.quantity.toLocaleString("mn-MN")} ш`,
    });
  }
  if (before.price !== after.price) {
    changes.push({ label: "Үнэ", from: money(before.price), to: money(after.price) });
  }
  if (before.total !== after.total) {
    changes.push({ label: "Нийт", from: money(before.total), to: money(after.total) });
  }
  const from = formatTime(new Date(before.createdAt));
  const to = formatTime(new Date(after.createdAt));
  if (from !== to) changes.push({ label: "Огноо", from, to });
  return changes;
}

/** The corrections grouped by the order they were made to. */
export function editsByOrder(edits: OrderEdit[]): Map<string, OrderEdit[]> {
  const byOrder = new Map<string, OrderEdit[]>();
  for (const edit of edits) {
    const list = byOrder.get(edit.orderId) ?? [];
    list.push(edit);
    byOrder.set(edit.orderId, list);
  }
  return byOrder;
}
