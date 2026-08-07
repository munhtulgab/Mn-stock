import assert from "node:assert/strict";
import { test } from "node:test";
import { needsPriceRefresh, PRICE_ATTEMPT_TTL_MS } from "./priceFreshness";

/**
 * The rule that decides whether a reader is shown today's price.
 *
 * The first case below is the bug this file exists for, twice reported: on
 * Friday the page showed Wednesday's close and then corrected itself to the
 * right one a second later, because the render and the quote endpoint each
 * decided separately whether the stored prices were current and reached
 * different answers. There is one rule now, and this is it.
 */

const NOW = Date.parse("2026-08-07T10:00:00+08:00");
const LONG_AGO = new Date(NOW - 60 * 60 * 1000);

test("refreshes when the newest stored close is older than today", () => {
  // Exactly the reported failure: it is the 7th, the store ends on the 5th.
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-05",
      today: "2026-08-07",
      lastAttemptAt: LONG_AGO,
      now: NOW,
    }),
    true,
  );
});

test("a stale snapshot cannot argue the store current", () => {
  // The old rule compared the store against a session date derived from a
  // cached snapshot built out of that same store, so two-day-old prices
  // proved themselves up to date. Nothing here can be talked round: the
  // comparison is against the calendar and only the calendar.
  for (const stored of ["2026-08-05", "2026-07-01", "2025-12-31"]) {
    assert.equal(
      needsPriceRefresh({
        newestStored: stored,
        today: "2026-08-07",
        lastAttemptAt: LONG_AGO,
        now: NOW,
      }),
      true,
      `${stored} should be refreshed against 2026-08-07`,
    );
  }
});

test("does not refresh once today's close is stored", () => {
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-07",
      today: "2026-08-07",
      lastAttemptAt: LONG_AGO,
      now: NOW,
    }),
    false,
  );
});

test("holds off for a few minutes after asking", () => {
  // Most of this market does not trade on a given day, so a company with no
  // close for today is the ordinary case and must not be re-fetched on every
  // render.
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-05",
      today: "2026-08-07",
      lastAttemptAt: new Date(NOW - 60_000),
      now: NOW,
    }),
    false,
  );

  // ...but it does ask again once the window is past, because a dormant
  // listing can trade at any minute of an open session.
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-05",
      today: "2026-08-07",
      lastAttemptAt: new Date(NOW - PRICE_ATTEMPT_TTL_MS - 1),
      now: NOW,
    }),
    true,
  );
});

test("a company with no stored price at all is fetched", () => {
  assert.equal(
    needsPriceRefresh({
      newestStored: null,
      today: "2026-08-07",
      lastAttemptAt: undefined,
      now: NOW,
    }),
    true,
  );
});

test("a stored date in the future is left alone", () => {
  // Some clock disagrees; asking again will not settle it, and retrying on
  // every render would be the worst of both.
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-09",
      today: "2026-08-07",
      lastAttemptAt: LONG_AGO,
      now: NOW,
    }),
    false,
  );
});

test("the day rolls over at Ulaanbaatar midnight, not the reader's", () => {
  // A reader in London at 23:00 on the 6th is looking at the 7th in
  // Ulaanbaatar, and the exchange's day is the one that counts. `today` is
  // always produced by ulaanbaatarDay, so the rule only has to be consistent
  // with whatever it is handed — this pins that it compares strings and does
  // not reach for a clock of its own.
  assert.equal(
    needsPriceRefresh({
      newestStored: "2026-08-06",
      today: "2026-08-07",
      lastAttemptAt: LONG_AGO,
      now: NOW,
    }),
    true,
  );
});
