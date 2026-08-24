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

/* -------------------------------------------------------------------------
   The session flag, and what it costs when the feed is down.

   The cache used to be written only on success, so a status endpoint that
   was refusing or hanging charged every render the whole timeout — and the
   home page now asks on every visit, to decide whether the pulse beside an
   index heading is drawn.
   ------------------------------------------------------------------------- */

const realFetch = globalThis.fetch;

/** Counts calls and answers however the test says. */
function stubFetch(answer: () => Promise<Response>) {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return answer();
  }) as typeof fetch;
  return () => calls;
}

const statusBody = (status: string) =>
  new Response(JSON.stringify({ status }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("the session flag is read from the exchange's own wording", async (t) => {
  const { fetchMarketOpen, __resetStatusCache } = await import("./quotes");
  t.after(() => {
    globalThis.fetch = realFetch;
    __resetStatusCache();
  });

  __resetStatusCache();
  stubFetch(async () => statusBody("Зах зээл нээлттэй"));
  assert.equal(await fetchMarketOpen(), true);

  __resetStatusCache();
  stubFetch(async () => statusBody("Зах зээл хаалттай"));
  assert.equal(await fetchMarketOpen(), false);
});

test("an answer is asked for once and then remembered", async (t) => {
  const { fetchMarketOpen, __resetStatusCache } = await import("./quotes");
  t.after(() => {
    globalThis.fetch = realFetch;
    __resetStatusCache();
  });

  __resetStatusCache();
  const calls = stubFetch(async () => statusBody("Зах зээл нээлттэй"));
  assert.equal(await fetchMarketOpen(), true);
  assert.equal(await fetchMarketOpen(), true);
  assert.equal(await fetchMarketOpen(), true);
  assert.equal(calls(), 1);
});

test("a failure is remembered too, so the wait is paid once", async (t) => {
  const { fetchMarketOpen, __resetStatusCache } = await import("./quotes");
  t.after(() => {
    globalThis.fetch = realFetch;
    __resetStatusCache();
  });

  __resetStatusCache();
  const calls = stubFetch(async () => {
    throw new Error("unreachable");
  });
  // Unknown, which the caller draws as "not in session" rather than guessing.
  assert.equal(await fetchMarketOpen(), null);
  assert.equal(await fetchMarketOpen(), null);
  assert.equal(calls(), 1);
});

test("a feed that falls over keeps the last state it gave", async (t) => {
  const { fetchMarketOpen, __resetStatusCache } = await import("./quotes");
  t.after(() => {
    globalThis.fetch = realFetch;
    __resetStatusCache();
  });

  __resetStatusCache();
  stubFetch(async () => statusBody("Зах зээл нээлттэй"));
  assert.equal(await fetchMarketOpen(), true);

  // The cache is cleared as if a minute had passed; the feed is now down.
  __resetStatusCache({ keepValue: true });
  stubFetch(async () => {
    throw new Error("unreachable");
  });
  assert.equal(await fetchMarketOpen(), true);
});
