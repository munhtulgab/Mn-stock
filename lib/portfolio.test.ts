import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./portfolio";
import type { PricePoint } from "./types";

const { sessionBase } = __testing;

/**
 * What a watchlist card's and the portfolio's "today" are measured from.
 *
 * The case that found this: at 20:10, after the close, TTL's running price
 * was 59,650 and so was the newest stored close — today's, already on file —
 * and measuring one against the other put +0.00% under every company on the
 * watchlist while the market list beside it said +0.25%.
 */

function point(date: string, close: number, previousClose = 0): PricePoint {
  return { companyCode: 1, date, open: close, high: close, low: close, close, volume: 1, previousClose } as PricePoint;
}

test("a running price is measured from its own previous close", () => {
  const last = point("2026-10-21", 59_650);
  const prev = point("2026-10-20", 59_500);
  assert.equal(
    sessionBase({ price: 59_650, previousClose: 59_500, date: "2026-10-21" }, last, prev),
    59_500,
  );
});

test("today's close already on file is not what today moved from", () => {
  // No previous close stated: the stored row is this session's, so the one
  // before it is the base.
  const last = point("2026-10-21", 59_650, 59_500);
  const prev = point("2026-10-20", 59_500);
  assert.equal(sessionBase({ price: 59_650, previousClose: null, date: "2026-10-21" }, last, prev), 59_500);
});

test("a running price a session ahead of the store is measured from the stored close", () => {
  const last = point("2026-10-20", 59_500);
  assert.equal(sessionBase({ price: 59_650, previousClose: null, date: "2026-10-21" }, last, null), 59_500);
});

test("no running price falls back to the stored session's own previous close", () => {
  const last = point("2026-10-21", 59_650, 59_500);
  assert.equal(sessionBase(undefined, last, null), 59_500);
});
