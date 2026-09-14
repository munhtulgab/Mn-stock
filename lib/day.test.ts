import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromUlaanbaatarStamp,
  ulaanbaatarStamp,
  ulaanbaatarDateTime,
  weekdayShort,
} from "./day";

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

test("a weekday shortens to two letters that stay distinct", () => {
  // Seven of these sit side by side under seven columns, so any two that
  // collapsed to the same pair would label the wrong day and never be caught
  // by eye. Sunday through Saturday, one week.
  const week = [
    "2026-09-13",
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
  ].map(weekdayShort);
  assert.deepEqual(week, ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"]);
  assert.equal(new Set(week).size, 7);
});

test("a weekday is read off the digits, not the reader's clock", () => {
  // These are already Ulaanbaatar days. Handing one to a local Date would
  // move the days near midnight by one, which is how an axis ends up with
  // two Mondays in it.
  assert.equal(weekdayShort("2026-09-14"), "Да");
  assert.equal(weekdayShort("2026-09-14T23:59:59"), "Да");
});

test("a date that is not one comes back empty rather than as Invalid", () => {
  assert.equal(weekdayShort(""), "");
  assert.equal(weekdayShort("өнөөдөр"), "");
});
