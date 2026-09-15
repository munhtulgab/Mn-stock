import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromUlaanbaatarStamp,
  ulaanbaatarStamp,
  ulaanbaatarDateTime,
  weekdayIndex,
  WEEKDAYS_SHORT,
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

test("the week starts on Monday and ends on Sunday", () => {
  // The axis is drawn in this order, so an index that counted from Sunday
  // would put every bar one column from its own label.
  const week = [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ].map(weekdayIndex);
  assert.deepEqual(week, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    week.map((i) => WEEKDAYS_SHORT[i]),
    ["Дав", "Мяг", "Лха", "Пүр", "Баа", "Бям", "Ням"],
  );
});

test("no two weekday labels are the same three letters", () => {
  // Any two that collapsed would label the wrong column and never be caught
  // by eye. "Ба"/"Бя" is exactly the pair that made two letters too few.
  assert.equal(new Set(WEEKDAYS_SHORT).size, 7);
  assert.equal(WEEKDAYS_SHORT.length, 7);
});

test("a weekday is read off the digits, not the reader's clock", () => {
  // These are already Ulaanbaatar days. Handing one to a local Date would
  // move the days near midnight by one, which is how an axis ends up with
  // two Mondays in it.
  assert.equal(weekdayIndex("2026-09-14"), 0);
  assert.equal(weekdayIndex("2026-09-14T23:59:59"), 0);
});

test("a date that is not one lands on Monday rather than off the end", () => {
  // It indexes an array of seven that is drawn without checking. NaN there
  // is an undefined label and a bar that counts into nothing.
  assert.equal(weekdayIndex(""), 0);
  assert.equal(weekdayIndex("өнөөдөр"), 0);
});
