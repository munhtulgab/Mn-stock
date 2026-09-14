import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compactTugrug } from "./tugrug";

test("each magnitude is named in Mongolian, not abbreviated", () => {
  assert.equal(compactTugrug(940), "940\u00A0₮");
  assert.equal(compactTugrug(12_400), "12 мянга\u00A0₮");
  assert.equal(compactTugrug(12_400_000), "12.4 сая\u00A0₮");
  assert.equal(compactTugrug(3_260_000_000), "3.3 тэрбум\u00A0₮");
});

test("the boundaries belong to the larger unit", () => {
  // 1 000 000 is "1.0 сая\u00A0₮" and not "1000 мянга₮": the whole point of the
  // short form is that the magnitude is read without counting digits.
  assert.equal(compactTugrug(1_000), "1 мянга\u00A0₮");
  assert.equal(compactTugrug(1_000_000), "1.0 сая\u00A0₮");
  assert.equal(compactTugrug(1_000_000_000), "1.0 тэрбум\u00A0₮");
});

test("nothing is zero rather than an empty string", () => {
  assert.equal(compactTugrug(0), "0\u00A0₮");
});

test("a negative keeps its sign in front of the figure, not the unit", () => {
  // A correcting order is a negative sum, and "-3.3 тэрбум\u00A0₮" has to read as
  // one number rather than as a subtraction of two.
  assert.equal(compactTugrug(-3_260_000_000), "-3.3 тэрбум\u00A0₮");
  assert.equal(compactTugrug(-940), "-940\u00A0₮");
});
