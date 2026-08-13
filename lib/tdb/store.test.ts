import assert from "node:assert/strict";
import { test } from "node:test";
import { pooled } from "./store";

/**
 * The TDB sweep asks about eighty-odd companies, three calls each. Doing that
 * one company at a time is hundreds of sequential round trips inside a sync
 * whose caller allows it twenty seconds; doing it all at once is a flood at
 * an API being read without being asked. So it runs a few at a time, and
 * "a few" has to actually hold.
 */

test("every item is worked exactly once", async () => {
  const seen: number[] = [];
  await pooled([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    seen.push(n);
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("never more than the limit are in flight", async () => {
  let live = 0;
  let peak = 0;
  await pooled(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live--;
  });
  assert.equal(peak, 4);
});

test("a limit above the count is not a limit", async () => {
  let peak = 0;
  let live = 0;
  await pooled([1, 2], 10, async () => {
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live--;
  });
  // Two items cannot be more than two at a time, and asking for ten workers
  // must not spawn eight that immediately find nothing to do and hang.
  assert.equal(peak, 2);
});

test("nothing to do finishes rather than hanging", async () => {
  let ran = 0;
  await pooled([], 4, async () => {
    ran++;
  });
  assert.equal(ran, 0);
});

test("a failure surfaces instead of being swallowed", async () => {
  await assert.rejects(
    pooled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
    }),
    /boom/,
  );
});
