import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  StatementError,
  positionsFrom,
  summarise,
  type StatementFill,
} from "./statementImport";

function fill(over: Partial<StatementFill> = {}): StatementFill {
  return {
    date: "2024-01-02",
    symbol: "APU",
    companyCode: 90,
    side: "BUY",
    quantity: 100,
    price: 1000,
    settled: 101_000,
    fee: 1000,
    ...over,
  };
}

test("a single buy is held at what it cost", () => {
  const [position] = positionsFrom([fill()]);
  assert.equal(position.quantity, 100);
  assert.equal(position.avgCost, 1000);
});

test("two buys average by weight, not by count", () => {
  const [position] = positionsFrom([
    fill({ quantity: 100, price: 1000 }),
    fill({ date: "2024-02-02", quantity: 300, price: 1200 }),
  ]);
  assert.equal(position.quantity, 400);
  // 400 shares for 460,000, not the midpoint of 1000 and 1200.
  assert.equal(position.avgCost, 1150);
});

test("commission stays out of the cost of the shares", () => {
  // The app charges none on its own buys, so an imported position that
  // carried it would report a smaller gain than the same position bought here.
  const [position] = positionsFrom([fill({ quantity: 10, price: 500, fee: 5000 })]);
  assert.equal(position.avgCost, 500);
});

test("a sale leaves the rest at the same average", () => {
  const [position] = positionsFrom([
    fill({ quantity: 100, price: 1000 }),
    fill({ date: "2024-03-01", side: "SELL", quantity: 40, price: 1500 }),
  ]);
  assert.equal(position.quantity, 60);
  assert.equal(position.avgCost, 1000);
});

test("a position sold out is not a holding", () => {
  const positions = positionsFrom([
    fill({ symbol: "GOV", quantity: 419, price: 248 }),
    fill({ symbol: "GOV", date: "2026-08-04", side: "SELL", quantity: 419, price: 300 }),
  ]);
  assert.deepEqual(positions, []);
});

test("fills are run in date order however they arrive", () => {
  const jumbled = [
    fill({ date: "2024-03-01", side: "SELL", quantity: 40, price: 1500 }),
    fill({ date: "2024-01-02", quantity: 100, price: 1000 }),
  ];
  const [position] = positionsFrom(jumbled);
  assert.equal(position.quantity, 60);
});

test("selling more than is held is a broken statement, not a short", () => {
  assert.throws(
    () =>
      positionsFrom([
        fill({ quantity: 10 }),
        fill({ date: "2024-04-01", side: "SELL", quantity: 11 }),
      ]),
    StatementError,
  );
});

test("shares transferred in cost nothing and still count", () => {
  // State-allocated ETT arrives at a stated price of zero.
  const [position] = positionsFrom([
    fill({ symbol: "ETT", companyCode: 535, quantity: 1072, price: 0, settled: 0, fee: 0 }),
  ]);
  assert.equal(position.quantity, 1072);
  assert.equal(position.avgCost, 0);
});

test("the summary counts fees over every fill, closed positions included", () => {
  const fills = [
    fill({ symbol: "GOV", quantity: 100, price: 250, fee: 250 }),
    fill({ symbol: "GOV", date: "2026-08-04", side: "SELL", quantity: 100, price: 300, fee: 300 }),
    fill({ symbol: "APU", quantity: 10, price: 1000, fee: 100 }),
  ];
  const summary = summarise(fills, positionsFrom(fills));
  assert.equal(summary.fees, 650);
  assert.equal(summary.costBasis, 10_000);
  assert.deepEqual(summary.closed, ["GOV"]);
  assert.equal(summary.bought, 2);
  assert.equal(summary.sold, 1);
});
