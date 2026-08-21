import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  dueForRefresh,
  getTdbDividends,
  pooled,
  SYNC_VERSION,
  type SyncMeta,
} from "./store";
import type { TdbDividend } from "./datalab";

/**
 * The TDB sweep asks about eighty-odd companies, three calls each. Doing that
 * one company at a time is hundreds of sequential round trips inside a sync
 * whose caller allows it twenty seconds; doing it all at once is a flood at
 * an API being read without being asked. So it runs a few at a time, and
 * "a few" has to actually hold.
 */

test("every item is worked exactly once", async () => {
  const seen: number[] = [];
  await pooled([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    seen.push(n);
  });
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("never more than the limit are in flight", async () => {
  let live = 0;
  let peak = 0;
  await pooled(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live--;
  });
  assert.equal(peak, 4);
});

test("a limit above the count is not a limit", async () => {
  let peak = 0;
  let live = 0;
  await pooled([1, 2], 10, async () => {
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live--;
  });
  // Two items cannot be more than two at a time, and asking for ten workers
  // must not spawn eight that immediately find nothing to do and hang.
  assert.equal(peak, 2);
});

test("nothing to do finishes rather than hanging", async () => {
  let ran = 0;
  await pooled([], 4, async () => {
    ran++;
  });
  assert.equal(ran, 0);
});

test("a failure surfaces instead of being swallowed", async () => {
  await assert.rejects(
    pooled([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
    }),
    /boom/,
  );
});

/**
 * Datalab tells the same dividend story twice, over different lengths.
 *
 * Its per-company endpoint answers with four years and stops; its market-wide
 * year list carries the same dividend column back to 2018, which is what the
 * site's own dividends view is drawn from. The card on the company page is
 * meant to show the whole run, so the reader was seeing four years of a
 * history that is eight years long.
 */

function row(year: number, amount: number, extra: Partial<TdbDividend> = {}): TdbDividend {
  return {
    year,
    amountPerShare: amount,
    totalPaid: null,
    yieldPct: null,
    payoutRatio: null,
    ...extra,
  };
}

/** A Mongo stand-in that answers with one stored document. */
function dbWith(doc: unknown): Db {
  return {
    collection: () => ({ findOne: async () => doc }),
  } as unknown as Db;
}

test("both accounts of the history are read, longest first", async () => {
  const dividends = await getTdbDividends(
    dbWith({
      companyCode: 90,
      annual: [2021, 2020, 2019, 2018].map((y) => row(y, y - 2000)),
      history: [row(2022, 150.83), row(2021, 103.44)],
    }),
    90,
  );

  assert.deepEqual(
    dividends.map((d) => d.year),
    [2022, 2021, 2020, 2019, 2018],
  );
});

test("the per-company endpoint wins a year both cover", async () => {
  const dividends = await getTdbDividends(
    dbWith({
      companyCode: 90,
      annual: [row(2025, 130, { yieldPct: 13.3 })],
      history: [row(2025, 130, { yieldPct: 13.3, totalPaid: 1.38e11 })],
    }),
    90,
  );

  assert.equal(dividends.length, 1);
  // The narrower source states the total paid out; the wider one never does,
  // so taking the wider row would lose a column rather than a year.
  assert.equal(dividends[0].totalPaid, 1.38e11);
});

test("a company the year list reached but the per-company sweep did not", async () => {
  // Хаан банк's per-company history comes back as four years of nulls, which
  // the fetcher drops entirely. Before the year list was kept, that left the
  // card with nothing at all for a bank that pays every year.
  const dividends = await getTdbDividends(
    dbWith({ companyCode: 563, annual: [row(2024, 189), row(2023, 154)], history: [] }),
    563,
  );

  assert.deepEqual(
    dividends.map((d) => d.year),
    [2024, 2023],
  );
});

test("a document stored before the year list was kept still reads", async () => {
  const dividends = await getTdbDividends(
    dbWith({ companyCode: 90, history: [row(2024, 99)] }),
    90,
  );

  assert.deepEqual(
    dividends.map((d) => d.year),
    [2024],
  );
});

test("a company Datalab does not cover has no history rather than an error", async () => {
  assert.deepEqual(await getTdbDividends(dbWith(null), 999), []);
});

/**
 * When the dividend refresh is allowed to run.
 *
 * It is called from a page render, so both halves of this matter: too eager
 * and every visitor pays for nine HTTP calls, too shy and a change to what the
 * app stores waits a day for the nightly sync — which is exactly what happened
 * the day it started keeping 2018 and 2019, and what a reader reported as a
 * history that stopped at 2022.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** What a document stamped by an attempt that never finished carries. */
const NEVER_SYNCED = new Date(0);

const NOW = Date.UTC(2026, 7, 21, 7, 0, 0);

function stamp(partial: Partial<SyncMeta>): SyncMeta {
  return { key: "tdbDividendSync", syncedAt: new Date(NOW), ...partial };
}

test("a sweep that has never run is due", () => {
  assert.equal(dueForRefresh(null, NOW), true);
});

test("a sweep finished by this version an hour ago is not", () => {
  assert.equal(
    dueForRefresh(stamp({ syncedAt: new Date(NOW - HOUR), version: SYNC_VERSION }), NOW),
    false,
  );
});

test("a week old is due again", () => {
  assert.equal(
    dueForRefresh(
      stamp({ syncedAt: new Date(NOW - 8 * DAY), attemptedAt: new Date(NOW - 8 * DAY), version: SYNC_VERSION }),
      NOW,
    ),
    true,
  );
});

test("a sweep finished by an older version is due however recent", () => {
  // The case this whole mechanism exists for: the code now fetches years the
  // last run did not, so yesterday's success is not this version's success.
  assert.equal(
    dueForRefresh(
      stamp({ syncedAt: new Date(NOW - HOUR), attemptedAt: new Date(NOW - HOUR), version: SYNC_VERSION - 1 }),
      NOW,
    ),
    true,
  );
});

test("an attempt in the last half hour holds the next one off", () => {
  // A source that is down must not be asked again by every render. The
  // attempt is stamped whether or not it succeeds, which is what makes this
  // a ceiling on the damage rather than a hope.
  assert.equal(
    dueForRefresh(stamp({ syncedAt: NEVER_SYNCED, attemptedAt: new Date(NOW - 60_000) }), NOW),
    false,
  );
});

test("once the half hour is up a failed attempt is retried", () => {
  assert.equal(
    dueForRefresh(stamp({ syncedAt: NEVER_SYNCED, attemptedAt: new Date(NOW - 2 * HOUR) }), NOW),
    true,
  );
});
