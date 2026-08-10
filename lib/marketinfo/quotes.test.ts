import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./quotes";

const { boardIsAboutToday } = __testing;

/**
 * The exchange's movers board carries no date. It is only safe to read as
 * "today" inside a trading day; outside one it is still showing the last
 * session, and stamping that with the current date would tell a Sunday
 * reader that Friday's price is live — the exact fault this fallback exists
 * to avoid, arrived at from the other side.
 *
 * Times are UTC; Ulaanbaatar is UTC+8.
 */
const ub = (iso: string) => new Date(iso);

test("a weekday session is today's board", () => {
  // Monday 2026-08-10, 11:00 Ulaanbaatar.
  assert.equal(boardIsAboutToday(ub("2026-08-10T03:00:00Z")), true);
  // Monday 10:00 exactly, the open.
  assert.equal(boardIsAboutToday(ub("2026-08-10T02:00:00Z")), true);
  // Monday 16:59, still the day the board describes.
  assert.equal(boardIsAboutToday(ub("2026-08-10T08:59:00Z")), true);
});

test("outside the window the board is last session's, and is not used", () => {
  // Monday 09:00 Ulaanbaatar — before the open, board still shows Friday.
  assert.equal(boardIsAboutToday(ub("2026-08-10T01:00:00Z")), false);
  // Monday 18:00 — long after the close.
  assert.equal(boardIsAboutToday(ub("2026-08-10T10:00:00Z")), false);
  // Monday 03:00 in the small hours.
  assert.equal(boardIsAboutToday(ub("2026-08-09T19:00:00Z")), false);
});

test("the weekend never counts, whatever the hour", () => {
  // Saturday 2026-08-08 and Sunday 2026-08-09, both at 11:00 Ulaanbaatar.
  assert.equal(boardIsAboutToday(ub("2026-08-08T03:00:00Z")), false);
  assert.equal(boardIsAboutToday(ub("2026-08-09T03:00:00Z")), false);
});
