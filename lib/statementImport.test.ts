import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
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

test("a single buy is held at what the account was debited", () => {
  const [position] = positionsFrom([fill({ quantity: 100, price: 1000, settled: 101_000 })]);
  assert.equal(position.quantity, 100);
  // 100,000₮ of shares and 1,000₮ of commission, which is what was paid.
  assert.equal(position.avgCost, 1010);
});

test("two buys average by weight, not by count", () => {
  const [position] = positionsFrom([
    fill({ quantity: 100, price: 1000, settled: 100_000, fee: 0 }),
    fill({ date: "2024-02-02", quantity: 300, price: 1200, settled: 360_000, fee: 0 }),
  ]);
  assert.equal(position.quantity, 400);
  // 400 shares for 460,000, not the midpoint of 1000 and 1200.
  assert.equal(position.avgCost, 1150);
});

test("commission is part of what the shares cost", () => {
  // The broker states cost this way, and a position that left the commission
  // out would report a profit the account has not made.
  const [position] = positionsFrom([
    fill({ quantity: 10, price: 500, settled: 5_500, fee: 500 }),
  ]);
  assert.equal(position.avgCost, 550);
});

test("a sale leaves the rest at the same average", () => {
  const [position] = positionsFrom([
    fill({ quantity: 100, price: 1000, settled: 101_000 }),
    fill({ date: "2024-03-01", side: "SELL", quantity: 40, price: 1500, settled: 58_500 }),
  ]);
  assert.equal(position.quantity, 60);
  assert.equal(position.avgCost, 1010);
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

test("an excluded symbol is owned but not carried", () => {
  const positions = positionsFrom(
    [
      fill({ symbol: "ETT", quantity: 1072, price: 0, settled: 0, fee: 0 }),
      fill({ symbol: "APU" }),
    ],
    ["ETT"],
  );
  assert.deepEqual(positions.map((p) => p.symbol), ["APU"]);
});

test("the summary counts fees over every fill, closed positions included", () => {
  const fills = [
    fill({ symbol: "GOV", quantity: 100, price: 250, fee: 250 }),
    fill({ symbol: "GOV", date: "2026-08-04", side: "SELL", quantity: 100, price: 300, fee: 300 }),
    fill({ symbol: "APU", quantity: 10, price: 1000, fee: 100 }),
  ];
  const summary = summarise(fills, positionsFrom(fills));
  assert.equal(summary.fees, 650);
  assert.equal(summary.costBasis, 101_000);
  assert.deepEqual(summary.closed, ["GOV"]);
  assert.equal(summary.bought, 2);
  assert.equal(summary.sold, 1);
});

test("the Golomt statements reproduce the broker's own portfolio screen", () => {
  // Not a unit test of the arithmetic but of the whole pipeline against the
  // only authority there is: what the broker's app shows for this account on
  // 2026-08-15. Every figure below was read off that screen.
  const statement = JSON.parse(
    readFileSync(new URL("../scripts/statements/golomt.json", import.meta.url), "utf8"),
  ) as { transactions: StatementFill[]; excluded: string[] };

  const positions = positionsFrom(statement.transactions, statement.excluded);
  const cost = Object.fromEntries(
    positions.map((p) => [p.symbol, Math.round(p.quantity * p.avgCost * 100) / 100]),
  );

  assert.deepEqual(
    Object.fromEntries(positions.map((p) => [p.symbol, p.quantity])),
    { APU: 1500, GLMT: 151, KHAN: 520, MFC: 5300, MLG: 2717, NEH: 4385, SUU: 326, TUM: 1132 },
  );
  assert.deepEqual(cost, {
    GLMT: 172_729.19,
    APU: 1_569_236.6,
    SUU: 200_347.64,
    TUM: 423_997.61,
    NEH: 50_416.0,
    MLG: 422_463.59,
    KHAN: 589_933.93,
    MFC: 431_098.7,
  });
});

test("a symbol left out of the valuation is not reported as sold", () => {
  // ETT is excluded because there is no price for it, not because it is gone.
  const fills = [
    fill({ symbol: "ETT", quantity: 1072, price: 0, settled: 0, fee: 0 }),
    fill({ symbol: "GOV", quantity: 100, price: 250 }),
    fill({ symbol: "GOV", date: "2026-08-04", side: "SELL", quantity: 100, price: 300 }),
  ];
  const summary = summarise(fills, positionsFrom(fills, ["ETT"]));
  assert.deepEqual(summary.closed, ["GOV"]);
});
