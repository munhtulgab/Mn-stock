import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./sync";

const { needsCatchUp, prune, CATCH_UP_SHARE } = __testing;

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
