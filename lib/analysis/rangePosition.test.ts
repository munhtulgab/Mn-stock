import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rangePosition } from "@/components/FundamentalPanel";

test("a price at either end of the year sits at either end of the bar", () => {
  assert.equal(rangePosition(901.02, 901.02, 1070), 0);
  assert.equal(rangePosition(1070, 901.02, 1070), 100);
});

test("APU's own figures put it where the arithmetic says", () => {
  // The range the app computes for APU, and a price partway up it.
  const position = rangePosition(983.57, 901.02, 1070);
  assert.ok(position !== null);
  assert.equal(Math.round(position), 49);
});

test("a year at one price has no position within it", () => {
  // Every division here is by the width of the range, and a company that
  // never moved has none — reporting 0% would read as "at its low".
  assert.equal(rangePosition(500, 500, 500), null);
  assert.equal(rangePosition(500, 600, 400), null);
});

test("a missing figure gives no answer rather than a wrong one", () => {
  assert.equal(rangePosition(null, 901, 1070), null);
  assert.equal(rangePosition(983, null, 1070), null);
  assert.equal(rangePosition(983, 901, null), null);
});

test("a price outside the range is still reported truthfully", () => {
  // Clamping belongs to the bar that draws it, not to the figure: the
  // extremes are a session behind the live quote and a new high is real.
  const position = rangePosition(1100, 901.02, 1070);
  assert.ok(position !== null && position > 100);
});
