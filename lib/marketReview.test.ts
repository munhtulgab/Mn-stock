import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./marketReview";

const { lastSessionBefore } = __testing;

/**
 * The day's card covers the last session that has closed, not the newest one
 * held. The exchange writes a session up the morning after it, so the report
 * beside the card is about the day before today; a card about today put two
 * different days side by side under one heading.
 */

type Close = { date: string; close: number; turnover: number };

/** Each company's closes, ascending, which is the order the review builds. */
function series(...dates: string[]): Close[] {
  return dates.map((date) => ({ date, close: 100, turnover: 1 }));
}

function held(...companies: Close[][]): Map<number, Close[]> {
  return new Map(companies.map((rows, i) => [i + 1, rows]));
}

test("takes the newest session before the day asked about", () => {
  const rows = held(series("2026-08-10", "2026-08-11", "2026-08-12"));
  assert.equal(lastSessionBefore(rows, "2026-08-13"), "2026-08-12");
});

test("today's own session is never the day's card", () => {
  // The live feed appends today while the market is open and after it shuts.
  const rows = held(series("2026-08-11", "2026-08-12", "2026-08-13"));
  assert.equal(lastSessionBefore(rows, "2026-08-13"), "2026-08-12");
});

test("on a Monday it reaches back over the weekend to Friday", () => {
  // 2026-08-07 is a Friday, 2026-08-10 the Monday after it.
  const rows = held(series("2026-08-05", "2026-08-06", "2026-08-07"));
  assert.equal(lastSessionBefore(rows, "2026-08-10"), "2026-08-07");
});

test("the newest across companies wins, not the first one found", () => {
  // A company that last traded on the 6th must not date the whole card.
  const rows = held(
    series("2026-08-05", "2026-08-06"),
    series("2026-08-05", "2026-08-12"),
    series("2026-08-07"),
  );
  assert.equal(lastSessionBefore(rows, "2026-08-13"), "2026-08-12");
});

test("nothing before the day is null rather than a guess", () => {
  const rows = held(series("2026-08-13"), series("2026-08-13"));
  assert.equal(lastSessionBefore(rows, "2026-08-13"), null);
});

test("no prices at all is null", () => {
  assert.equal(lastSessionBefore(new Map(), "2026-08-13"), null);
});
