import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterChange,
  checkChange,
  effectOf,
  mirrorOf,
  OrderCorrectionError,
  type AccountState,
  type OrderLike,
} from "./adminOrders";
import type { Transaction } from "./types";

const buy = (quantity: number, price: number): OrderLike => ({
  side: "BUY",
  quantity,
  total: quantity * price,
});
const sell = (quantity: number, price: number): OrderLike => ({
  side: "SELL",
  quantity,
  total: quantity * price,
});

/** The account as it stands after `orders` have been filled in turn. */
function fill(cash: number, orders: OrderLike[]): AccountState {
  return orders.reduce<AccountState>(
    (state, order) => afterChange(state, null, order),
    { cash, held: 0, avgCost: 0 },
  );
}

test("a buy spends the cash and holds the shares at what it paid", () => {
  const state = fill(1_000_000, [buy(100, 250)]);
  assert.equal(state.cash, 975_000);
  assert.equal(state.held, 100);
  assert.equal(state.avgCost, 250);
});

test("a second buy averages the two prices", () => {
  const state = fill(1_000_000, [buy(100, 250), buy(100, 350)]);
  assert.equal(state.held, 200);
  assert.equal(state.avgCost, 300);
  assert.equal(state.cash, 940_000);
});

test("removing an order puts the account back where it started", () => {
  const opened = { cash: 1_000_000, held: 0, avgCost: 0 };
  const order = buy(100, 250);
  const filled = afterChange(opened, null, order);
  assert.deepEqual(afterChange(filled, order, null), opened);
});

test("removing the newer of two buys leaves the older one's price", () => {
  const state = fill(1_000_000, [buy(100, 250), buy(100, 350)]);
  const back = afterChange(state, buy(100, 350), null);
  assert.equal(back.held, 100);
  assert.equal(back.avgCost, 250);
  assert.equal(back.cash, 975_000);
});

test("a sell returns cash and leaves the average alone", () => {
  const held = fill(1_000_000, [buy(100, 250), buy(100, 350)]);
  const sold = afterChange(held, null, sell(50, 400));
  assert.equal(sold.held, 150);
  assert.equal(sold.avgCost, 300, "selling is not a repricing of what is left");
  assert.equal(sold.cash, 960_000);
});

test("removing a sell brings the shares back at the price they left at", () => {
  const held = fill(1_000_000, [buy(100, 250), buy(100, 350)]);
  const sold = afterChange(held, null, sell(50, 400));
  const back = afterChange(sold, sell(50, 400), null);
  assert.equal(back.held, 200);
  assert.equal(back.avgCost, 300);
  assert.equal(back.cash, 940_000);
});

test("editing an order is the old one undone and the new one done", () => {
  const state = fill(1_000_000, [buy(100, 250)]);
  const fixed = afterChange(state, buy(100, 250), buy(10, 250));
  assert.equal(fixed.held, 10, "a hundred was a typo for ten");
  assert.equal(fixed.avgCost, 250);
  assert.equal(fixed.cash, 997_500);
});

test("an edit may turn a buy into a sell", () => {
  const state = fill(1_000_000, [buy(100, 250), buy(100, 250)]);
  const fixed = afterChange(state, buy(100, 250), sell(100, 250));
  assert.equal(fixed.held, 0);
  assert.equal(fixed.avgCost, 0, "nothing held has no price per share");
  assert.equal(fixed.cash, 1_000_000);
});

test("the last shares leaving takes the average with them", () => {
  const state = fill(1_000_000, [buy(100, 250)]);
  const sold = afterChange(state, null, sell(100, 400));
  assert.equal(sold.held, 0);
  assert.equal(sold.avgCost, 0);
});

test("a correction that oversells what is held is refused", () => {
  const state = fill(1_000_000, [buy(100, 250)]);
  // The buy is being removed after 60 of its shares have already been sold on.
  const afterSelling = afterChange(state, null, sell(60, 300));
  const next = afterChange(afterSelling, buy(100, 250), null);
  assert.ok(next.held < 0);
  assert.throws(
    () => checkChange(next, "QPAY"),
    (err: unknown) =>
      err instanceof OrderCorrectionError && /QPAY/.test((err as Error).message),
  );
});

test("a correction that overdraws the cash is refused", () => {
  const state = { cash: 1_000, held: 100, avgCost: 250 };
  const next = afterChange(state, sell(100, 250), null);
  assert.throws(() => checkChange(next, "QPAY"), OrderCorrectionError);
});

test("rounding never leaves a negative price per share", () => {
  const state = { cash: 0, held: 3, avgCost: 0.1 + 0.2 };
  const next = afterChange(state, { side: "BUY", quantity: 0, total: 0.9 }, null);
  assert.equal(next.held, 3);
  assert.ok(next.avgCost >= 0);
});

test("an effect is stated in the three things an order moves", () => {
  assert.deepEqual(effectOf(buy(10, 100), 0), { cash: -1000, shares: 10, basis: 1000 });
  assert.deepEqual(effectOf(sell(10, 100), 80), { cash: 1000, shares: -10, basis: -800 });
});

test("a mirror order is the same trade the other way round", () => {
  const at = new Date("2026-09-12T03:00:00Z");
  const tx = {
    _id: "68c000000000000000000001",
    userId: "u1",
    companyCode: 42,
    symbol: "QPAY",
    side: "BUY",
    quantity: 10,
    price: 100,
    total: 1000,
    createdAt: new Date("2026-09-01T03:00:00Z"),
  } as Transaction;
  const mirror = mirrorOf(tx, at);
  assert.equal(mirror.side, "SELL");
  assert.equal(mirror.quantity, 10);
  assert.equal(mirror.total, 1000);
  assert.equal(mirror.reversalOf, "68c000000000000000000001");
  assert.equal(mirror.createdAt, at);
  assert.equal(mirror._id, undefined, "the mirror is a new row, not the old one");
});

test("an order and its mirror leave the account as it was", () => {
  const opened = { cash: 1_000_000, held: 0, avgCost: 0 };
  const order = buy(100, 250);
  const filled = afterChange(opened, null, order);
  const undone = afterChange(filled, null, sell(100, 250));
  assert.deepEqual(undone, opened);
});
