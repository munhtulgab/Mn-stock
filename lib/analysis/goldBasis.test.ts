import { test } from "node:test";
import assert from "node:assert/strict";
import { goldCandles, goldPremium, goldReturns } from "./goldBasis";
import type { Candle } from "./series";

const point = (date: string, price: number) => ({ date, price });

test("a quoted price becomes a flat bar, which is what a quote is", () => {
  assert.deepEqual(goldCandles([point("2026-09-11", 5044)]), [
    { date: "2026-09-11", open: 5044, high: 5044, low: 5044, close: 5044, volume: 0 },
  ]);
});

test("a span is measured from the last quote on or before the anniversary", () => {
  // The bank does not publish on the 12th in 2025; the 10th stands in.
  const rows = goldReturns(
    [point("2025-09-10", 4000), point("2025-09-15", 4100), point("2026-09-11", 5000)],
    "2026-09-12",
  );
  const year = rows.find((r) => r.label === "1 жил");
  assert.equal(year?.from, "2025-09-10");
  assert.equal(Math.round(year!.totalPct), 25);
  assert.equal(Math.round(year!.annualPct!), 25);
});

test("a span the series does not reach is not reported", () => {
  const rows = goldReturns([point("2025-09-10", 4000), point("2026-09-11", 5000)], "2026-09-12");
  assert.deepEqual(
    rows.map((r) => r.label),
    ["1 жил", "2025 оноос"],
  );
});

test("a multi-year span is compounded down to a year, not divided", () => {
  // Doubling over four years is 18.9% a year, not 25%.
  const rows = goldReturns(
    [point("2022-01-01", 1000), point("2026-01-01", 2000)],
    "2026-01-01",
  );
  const whole = rows.find((r) => r.label === "2022 оноос");
  assert.equal(Math.round(whole!.totalPct), 100);
  assert.ok(Math.abs(whole!.annualPct! - 18.92) < 0.2, String(whole!.annualPct));
});

test("nothing is claimed from a series of one", () => {
  assert.deepEqual(goldReturns([point("2026-09-11", 5000)], "2026-09-12"), []);
  assert.deepEqual(goldReturns([], "2026-09-12"), []);
});

const bar = (date: string, close: number): Candle => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

test("the premium is the fund against the metal on the same day", () => {
  const premium = goldPremium(
    [bar("2026-09-11", 5130)],
    [point("2026-09-11", 5044.0192)],
  );
  assert.equal(premium?.date, "2026-09-11");
  assert.equal(premium?.price, 5130);
  assert.ok(Math.abs(premium!.premiumPct - 1.705) < 0.01, String(premium!.premiumPct));
});

test("a session the bank did not quote takes its last quote", () => {
  const premium = goldPremium(
    [bar("2026-09-12", 5000)],
    [point("2026-09-10", 4000), point("2026-09-11", 5000)],
  );
  assert.equal(premium?.gold, 5000);
  assert.equal(premium?.premiumPct, 0);
});

test("the average is over every day both sides quote", () => {
  const premium = goldPremium(
    [bar("2026-09-10", 110), bar("2026-09-11", 90)],
    [point("2026-09-10", 100), point("2026-09-11", 100)],
  );
  // +10% then -10%, and the latest is the one shown.
  assert.equal(Math.round(premium!.averagePct!), 0);
  assert.equal(Math.round(premium!.premiumPct), -10);
  assert.equal(premium?.days, 2);
});

test("a fund older than the metal series is measured only where both run", () => {
  const premium = goldPremium(
    [bar("2008-01-01", 999), bar("2026-09-11", 5000)],
    [point("2026-09-11", 5000)],
  );
  assert.equal(premium?.days, 1);
  assert.equal(premium?.date, "2026-09-11");
});

test("no overlap at all is null rather than a figure", () => {
  assert.equal(goldPremium([bar("2008-01-01", 999)], [point("2026-09-11", 5000)]), null);
  assert.equal(goldPremium([], [point("2026-09-11", 5000)]), null);
  assert.equal(goldPremium([bar("2026-09-11", 5000)], []), null);
});
