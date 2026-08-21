import assert from "node:assert/strict";
import { test } from "node:test";
import { inLockstep, type LockstepInput } from "./consensus";

/**
 * The check that would have caught what a reader caught by eye.
 *
 * Five providers came back BUY at exactly 83% and the panel presented it as
 * 100% agreement. The cause is fixed — no model is shown this app's verdict
 * any more — but a panel whose entire claim is independence should be able to
 * notice when its own output stops looking independent, whatever the next
 * cause turns out to be.
 */

const ok = (signal: "BUY" | "SELL" | "HOLD", confidence: number): LockstepInput => ({
  ok: true,
  signal,
  confidence,
});

test("three models at the same call and the same number is not agreement", () => {
  assert.equal(
    inLockstep([ok("BUY", 83), ok("BUY", 83), ok("BUY", 83)]),
    true,
  );
});

test("the reported case, errors and all", () => {
  assert.equal(
    inLockstep([
      ok("BUY", 83), ok("BUY", 83), ok("BUY", 83),
      { ok: false },
      ok("BUY", 83), ok("BUY", 83),
    ]),
    true,
  );
});

test("real agreement differs in the decimals and is left alone", () => {
  assert.equal(
    inLockstep([ok("BUY", 78), ok("BUY", 83), ok("BUY", 71)]),
    false,
  );
});

test("one model out of step is enough to make it genuine", () => {
  assert.equal(inLockstep([ok("BUY", 83), ok("BUY", 83), ok("BUY", 82)]), false);
  assert.equal(inLockstep([ok("BUY", 83), ok("BUY", 83), ok("HOLD", 83)]), false);
});

test("two models are not a pattern", () => {
  // Two answers landing on the same round number happens; three is a tell.
  assert.equal(inLockstep([ok("BUY", 80), ok("BUY", 80)]), false);
});

test("failures do not count towards the three", () => {
  assert.equal(
    inLockstep([ok("BUY", 83), ok("BUY", 83), { ok: false } as never]),
    false,
  );
});

test("an empty panel says nothing rather than throwing", () => {
  assert.equal(inLockstep([]), false);
});
