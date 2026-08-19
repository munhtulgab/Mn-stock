import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mergeFills, positionsBefore, shortfalls, withoutPeriod } from "./merge";
import type { StatementFill } from "@/lib/statementImport";

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

test("a statement for a later period leaves the earlier ones alone", () => {
  const stored = [fill({ date: "2022-06-08" }), fill({ date: "2023-06-02" })];
  const incoming = [fill({ date: "2026-03-09" })];
  const merged = mergeFills(stored, incoming, { from: "2026-02-25", to: "2026-08-19" });
  assert.deepEqual(merged.map((f) => f.date), ["2022-06-08", "2023-06-02", "2026-03-09"]);
});

test("re-importing a period rebuilds it rather than doubling it", () => {
  // The same statement uploaded twice, or a corrected one covering the same
  // days: the file is the authority on its own period.
  const stored = [fill({ date: "2026-03-09" }), fill({ date: "2026-04-01" })];
  const incoming = [fill({ date: "2026-03-09", quantity: 44 })];
  const merged = mergeFills(stored, incoming, { from: "2026-02-25", to: "2026-08-19" });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 44);
});

test("a longer statement supersedes the shorter one it contains", () => {
  const stored = [fill({ date: "2026-03-09" })];
  const incoming = [fill({ date: "2026-03-09" }), fill({ date: "2026-08-15" })];
  const merged = mergeFills(stored, incoming, { from: "2026-02-25", to: "2026-08-19" });
  assert.equal(merged.length, 2);
});

test("only the overlapping period is cut, not the whole history", () => {
  const stored = [
    fill({ date: "2025-12-31" }),
    fill({ date: "2026-03-09" }),
    fill({ date: "2026-09-01" }),
  ];
  const kept = withoutPeriod(stored, { from: "2026-02-25", to: "2026-08-19" });
  assert.deepEqual(kept.map((f) => f.date), ["2025-12-31", "2026-09-01"]);
});

test("the history knows what was held the day a statement opens", () => {
  const fills = [
    fill({ date: "2024-01-02", quantity: 1000 }),
    fill({ date: "2025-01-02", side: "SELL", quantity: 400 }),
    // On the opening day itself, which the statement accounts for.
    fill({ date: "2026-02-25", quantity: 50 }),
  ];
  assert.equal(positionsBefore(fills, "2026-02-25").get("APU"), 600);
});

test("a complete run of statements has nothing missing", () => {
  const known = new Map([["APU", 1106]]);
  assert.deepEqual(shortfalls([{ symbol: "APU", quantity: 1106 }], known), []);
});

test("a gap is named by the shares nothing explains", () => {
  const known = new Map([["APU", 800]]);
  assert.deepEqual(shortfalls([{ symbol: "APU", quantity: 1106 }], known), [
    { symbol: "APU", stated: 1106, known: 800 },
  ]);
});

test("a symbol the history has never seen is short by all of it", () => {
  assert.deepEqual(shortfalls([{ symbol: "MLG", quantity: 593 }], new Map()), [
    { symbol: "MLG", stated: 593, known: 0 },
  ]);
});
