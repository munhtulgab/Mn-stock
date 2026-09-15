import { strict as assert } from "node:assert";
import { test } from "node:test";
import { alignDays, byWeekday, countTally, sumDays } from "./adminOverview";

test("a quiet day is a zero, not a missing bar", () => {
  // The gap is the point. Plotting only the days that have a row slides a
  // quiet Sunday up against a busy Friday as though they were neighbours,
  // and the sparkline shows a week that never happened.
  const days = ["2026-09-07", "2026-09-08", "2026-09-09"];
  const counts = new Map([["2026-09-07", 4], ["2026-09-09", 1]]);
  assert.deepEqual(alignDays(days, counts), [4, 0, 1]);
});

test("a week with nothing in it is seven zeros, not an empty array", () => {
  const days = ["2026-09-07", "2026-09-08"];
  assert.deepEqual(alignDays(days, new Map()), [0, 0]);
});

test("days the tally does not cover are ignored, not appended", () => {
  // The map is whatever the database returned; the days are the window. A
  // row outside it must not lengthen the series or the bars stop lining up
  // with the labels every card shares.
  const days = ["2026-09-08", "2026-09-09"];
  const counts = new Map([["2026-01-01", 99], ["2026-09-09", 2]]);
  assert.deepEqual(alignDays(days, counts), [0, 2]);
});

const TALLY = [
  { day: "2026-06-01", n: 120 },
  { day: "2026-09-06", n: 5 },
  { day: "2026-09-08", n: 3 },
  { day: "2026-09-11", n: 7 },
];

test("the total is every day ever counted, not the feed's cap", () => {
  // The whole reason the tally exists. The alerts collection is trimmed to
  // two hundred rows, so counting it answered two hundred for ever once the
  // cap was reached — a dashboard figure that could no longer move, with a
  // change beside it computed from two numbers that could no longer move.
  assert.equal(countTally(TALLY, "2026-09-07").total, 135);
});

test("the window is counted from its own edge, inclusive", () => {
  // A row dated exactly on the boundary is inside the window: the tally is
  // kept by day, so "seven days ago" means that whole day.
  assert.equal(countTally(TALLY, "2026-09-06").recent, 15);
  assert.equal(countTally(TALLY, "2026-09-07").recent, 10);
  assert.equal(countTally(TALLY, "2026-09-12").recent, 0);
});

test("an empty tally is zero rather than NaN", () => {
  // It is read on an installation's first day, before anything has fired.
  assert.deepEqual(countTally([], "2026-09-07"), { total: 0, recent: 0 });
});

test("the total is never smaller than the window inside it", () => {
  // The dashboard divides one by the other to get the change; a recent
  // larger than the total would print a negative base and a nonsense percent.
  for (const since of ["2026-01-01", "2026-06-01", "2026-09-08", "2027-01-01"]) {
    const { total, recent } = countTally(TALLY, since);
    assert.ok(recent <= total, `${since}: ${recent} of ${total}`);
  }
});

const WEEK: { day: string; count: number; turnover: number }[] = [
  { day: "2026-09-01", count: 2, turnover: 1_000 },
  { day: "2026-09-02", count: 0, turnover: 0 },
  { day: "2026-09-03", count: 5, turnover: 12_500 },
];

test("a run of days adds up to its orders and its turnover", () => {
  assert.deepEqual(sumDays(WEEK), { orders: 7, turnover: 13_500 });
});

test("no days at all is zero of each, not NaN", () => {
  // `daily.slice(-14, -7)` on an installation younger than a fortnight is
  // empty, and the card divides by what comes back to state its change.
  assert.deepEqual(sumDays([]), { orders: 0, turnover: 0 });
});

test("a quiet day contributes nothing but is not skipped", () => {
  // Guards the shape rather than the arithmetic: the digest's bars and this
  // total are read off the same array, so a sum that quietly dropped the
  // zeroes would disagree with the chart beside it.
  assert.equal(sumDays(WEEK.filter((d) => d.count === 0)).orders, 0);
  assert.equal(sumDays(WEEK).orders, sumDays(WEEK.filter((d) => d.count > 0)).orders);
});

/** A fortnight from a Monday, so every weekday appears exactly twice. */
const FORTNIGHT = Array.from({ length: 14 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 8, 14 + i)).toISOString().slice(0, 10),
  count: i + 1,
  turnover: 0,
}));

test("the weekday profile is Monday first and sums the whole window", () => {
  // Days 1..14 from a Monday: each weekday gets its day of the first week
  // plus the same day of the second, seven apart.
  assert.deepEqual(byWeekday(FORTNIGHT), [9, 11, 13, 15, 17, 19, 21]);
});

test("a weekday nothing fell on is a zero, not a missing column", () => {
  // The bars are drawn straight off this array. A short one would label the
  // wrong day, and a Sunday left out would silently become Monday.
  const weekdays = FORTNIGHT.filter((d) => d.count <= 5);
  const week = byWeekday(weekdays);
  assert.equal(week.length, 7);
  assert.deepEqual(week.slice(5), [0, 0]);
});

test("an empty window is seven zeros rather than an empty array", () => {
  assert.deepEqual(byWeekday([]), [0, 0, 0, 0, 0, 0, 0]);
});

test("every order in the window lands in exactly one weekday", () => {
  // The profile and the card's own Захиалга tile are read off the same days;
  // an order counted twice or dropped would make the two disagree.
  assert.equal(
    byWeekday(FORTNIGHT).reduce((a, b) => a + b, 0),
    sumDays(FORTNIGHT).orders,
  );
});
