import assert from "node:assert/strict";
import { test } from "node:test";
import { byLatestThenScore, type MarketRow } from "./marketOrder";

function row(symbol: string, lastDate: string | null, score: number | null): MarketRow {
  return { symbol, lastDate, score };
}

/** The symbols in the order the page would list them. */
function order(...rows: MarketRow[]): string[] {
  return [...rows].sort(byLatestThenScore).map((r) => r.symbol);
}

test("today's session comes before a better score from last month", () => {
  // The whole point. Four hundred listings share the page and most have not
  // traded in months; a dormant one keeps the score its last prices earned.
  assert.deepEqual(
    order(row("OLD", "2026-08-01", 9), row("TODAY", "2026-09-12", 2)),
    ["TODAY", "OLD"],
  );
});

test("within one session the best score leads", () => {
  assert.deepEqual(
    order(
      row("MID", "2026-09-12", 5),
      row("BEST", "2026-09-12", 8),
      row("WORST", "2026-09-12", 1),
    ),
    ["BEST", "MID", "WORST"],
  );
});

test("a listing that has never traded goes last, whatever it scores", () => {
  assert.deepEqual(
    order(row("NEVER", null, 10), row("TRADED", "2026-09-12", 1)),
    ["TRADED", "NEVER"],
  );
});

test("no verdict goes last among its own session, not below an older one", () => {
  assert.deepEqual(
    order(
      row("OLDER", "2026-08-01", 7),
      row("UNSCORED", "2026-09-12", null),
      row("SCORED", "2026-09-12", 3),
    ),
    ["SCORED", "UNSCORED", "OLDER"],
  );
});

test("a tie falls to the symbol, so the list does not shuffle", () => {
  const rows = [row("BBB", "2026-09-12", 4), row("AAA", "2026-09-12", 4)];
  assert.deepEqual(order(...rows), ["AAA", "BBB"]);
  assert.deepEqual(order(...[...rows].reverse()), ["AAA", "BBB"]);
});

test("two listings with neither a session nor a score still order stably", () => {
  assert.deepEqual(order(row("ZZ", null, null), row("AA", null, null)), ["AA", "ZZ"]);
});
