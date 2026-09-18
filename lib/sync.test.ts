import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./sync";

const {
  needsCatchUp,
  prune,
  CATCH_UP_SHARE,
  RECENT_SHARE,
  PRICE_SHARE,
  FETCH_CONCURRENCY,
  inParallel,
  recentlyTraded,
} = __testing;

/**
 * A company is "behind" when the live feed quotes it for a session the stored
 * history has not reached. Re-reading its history usually fixes that. For
 * four companies it never did — the exchange had not published those sessions
 * to its open-data portal — so they were re-read on every run, took the whole
 * price budget, and the rotation that keeps the dormant end of the market
 * fresh never got to run at all: its cursor sat on 83 of 162 across every run
 * measured.
 */

const mib = { companyCode: 517, symbol: "MIB", quotedDate: "2026-08-13" };

test("a company not read for this session is worth reading", () => {
  assert.equal(needsCatchUp(mib, {}), true);
});

test("read for this session already, so not again", () => {
  assert.equal(needsCatchUp(mib, { 517: "2026-08-13" }), false);
});

test("a newer session is a new reason to ask", () => {
  // Yesterday's attempt says nothing about whether today's has been filed.
  assert.equal(needsCatchUp(mib, { 517: "2026-08-12" }), true);
});

test("another company's record does not stand in for this one", () => {
  assert.equal(needsCatchUp(mib, { 90: "2026-08-13" }), true);
});

test("the record forgets companies that have left the exchange", () => {
  const kept = prune(
    { 90: "2026-08-13", 517: "2026-08-13" },
    [{ companyCode: 90 }],
  );
  assert.deepEqual(kept, { 90: "2026-08-13" });
});

test("the catch-up cannot take the whole price budget", () => {
  // The starvation this fixes: whatever share the catch-up gets, something
  // has to be left for the rotation.
  assert.ok(CATCH_UP_SHARE > 0 && CATCH_UP_SHARE < 0.6);
});

test("each phase stops before the next one's deadline", () => {
  // Four phases out of one budget: the catch-up, the companies that actually
  // traded, the rotation over everything else, and financials. Each must
  // leave the next something or the last of them never runs at all.
  assert.ok(CATCH_UP_SHARE > 0);
  assert.ok(CATCH_UP_SHARE < RECENT_SHARE);
  assert.ok(RECENT_SHARE < PRICE_SHARE);
  assert.ok(PRICE_SHARE < 1);
});

test("the session gets the most of any phase", () => {
  // Keeping up with the exchange is the job; the rest is housekeeping.
  const session = RECENT_SHARE - CATCH_UP_SHARE;
  assert.ok(session > CATCH_UP_SHARE);
  assert.ok(session > PRICE_SHARE - RECENT_SHARE);
  assert.ok(session > 1 - PRICE_SHARE);
});

/**
 * Which companies a run spends its budget on.
 *
 * The exchange publishes a close for the fifty-odd securities that traded
 * that day, and those are also the ones a reader is looking at. Reading the
 * whole four hundred in company-code order means the fifty wait behind
 * securities that have not printed in months.
 */
const listed = [
  { companyCode: 1, symbol: "AAA" },
  { companyCode: 2, symbol: "BBB" },
  { companyCode: 3, symbol: "CCC" },
  { companyCode: 4, symbol: "DDD" },
];
const traded = new Map([
  [1, "2026-01-04"],
  [2, "2026-09-17"],
  [3, "2026-06-30"],
  // 4 has never traded at all.
]);

test("the companies that traded most recently come first", () => {
  assert.deepEqual(
    recentlyTraded(listed, traded, 3).map((c) => c.symbol),
    ["BBB", "CCC", "AAA"],
  );
});

test("a company that has never traded is not in the queue at all", () => {
  // It has no close to be behind on, and the rotation will reach it.
  assert.ok(!recentlyTraded(listed, traded, 4).some((c) => c.symbol === "DDD"));
});

test("the queue is capped", () => {
  assert.equal(recentlyTraded(listed, traded, 2).length, 2);
});

test("the order does not depend on the order it was listed in", () => {
  const shuffled = [listed[3], listed[1], listed[0], listed[2]];
  assert.deepEqual(
    recentlyTraded(shuffled, traded, 3).map((c) => c.symbol),
    ["BBB", "CCC", "AAA"],
  );
});

/**
 * Reading several histories at once is the difference between covering a
 * session in a run and covering seven companies in it: one `tradeinfo` page
 * takes between two and three seconds, measured, and the exchange prints for
 * about fifty securities a day.
 */
test("the pool runs several at once and reports what it started", async () => {
  const started: number[] = [];
  let peak = 0;
  let inFlight = 0;
  const count = await inParallel([1, 2, 3, 4, 5, 6, 7, 8], 3, Date.now() + 10_000,
    async (n) => {
      started.push(n);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
  assert.equal(count, 8);
  assert.equal(started.length, 8);
  assert.equal(peak, 3);
});

test("the pool stops at its deadline and says how far it got", async () => {
  const done: number[] = [];
  const count = await inParallel([1, 2, 3, 4, 5, 6, 7, 8], 1, Date.now() + 25,
    async (n) => {
      done.push(n);
      await new Promise((r) => setTimeout(r, 10));
    });
  assert.ok(count < 8, `expected to run out of time, got ${count}`);
  // What it reports is what it started, which is what a cursor advances by:
  // nothing before that point is left for the next run to repeat.
  assert.equal(count, done.length);
});

test("an empty list is not a stalled pool", async () => {
  assert.equal(await inParallel([], FETCH_CONCURRENCY, Date.now() + 1000, async () => {}), 0);
});

test("one that throws does not take the rest of the run with it", async () => {
  const seen: number[] = [];
  const count = await inParallel([1, 2, 3], 2, Date.now() + 10_000, async (n) => {
    try {
      if (n === 2) throw new Error("the exchange said 500");
    } catch {
      // the caller's own catch, as `readPrices` has
    }
    seen.push(n);
  });
  assert.equal(count, 3);
  assert.deepEqual(seen.sort(), [1, 2, 3]);
});
