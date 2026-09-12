import assert from "node:assert/strict";
import { test } from "node:test";
import { fromUlaanbaatarStamp, ulaanbaatarStamp, ulaanbaatarDateTime } from "./day";

test("a typed Ulaanbaatar time is the instant whose clock reads it", () => {
  const at = fromUlaanbaatarStamp("2026-09-12T11:30");
  assert.equal(at.toISOString(), "2026-09-12T03:30:00.000Z");
  assert.equal(ulaanbaatarDateTime(at), "2026-09-12 11:30");
});

test("it undoes the stamp it is the inverse of, seconds and all", () => {
  for (const iso of [
    "2026-01-01T00:00:00.000Z",
    "2026-06-30T15:59:59.000Z",
    "2019-02-28T20:00:00.000Z",
    "2015-07-15T09:12:34.000Z", // a year Mongolia kept summer time
  ]) {
    const at = new Date(iso);
    assert.equal(
      fromUlaanbaatarStamp(ulaanbaatarStamp(at)).toISOString(),
      iso,
      `round trip through ${ulaanbaatarStamp(at)}`,
    );
  }
});

test("midnight in Ulaanbaatar is the previous afternoon in UTC", () => {
  assert.equal(
    fromUlaanbaatarStamp("2026-09-12T00:00").toISOString(),
    "2026-09-11T16:00:00.000Z",
  );
});

test("a time that is not one comes back as an invalid date", () => {
  assert.ok(Number.isNaN(fromUlaanbaatarStamp("nonsense").getTime()));
});
