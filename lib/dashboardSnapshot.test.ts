import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import { getDashboardRows, type DashboardRow } from "./data";

/**
 * Whether a reader ever waits for the market list to be rebuilt.
 *
 * Rebuilding it reads every active security, twelve years of prices for each,
 * and runs the full combined analysis over all four hundred — three
 * timeframes of indicators, the ratios, the sector medians. During trading
 * hours the price tick refreshes it every two minutes and nobody notices.
 * After the close it goes stale half an hour later, and whoever opened the
 * app next paid for the whole thing before a single row appeared. That is
 * what a reader reported at 19:55: a screen of grey blocks that would not
 * resolve.
 *
 * These pin the rule that fixed it. Anything stored is served immediately and
 * its staleness is reported; the caller rebuilds behind the response.
 */

const ROW = { symbol: "APU", companyCode: 90 } as unknown as DashboardRow;
/** Must match DASHBOARD_SCHEMA_VERSION in data.ts. */
const VERSION = 4;
const HALF_HOUR = 30 * 60 * 1000;

function dbWith(doc: unknown, onCompute?: () => void): Db {
  return {
    collection: () => ({
      findOne: async () => doc,
      updateOne: async () => {
        onCompute?.();
        return { modifiedCount: 1 };
      },
      find: () => {
        onCompute?.();
        throw new Error("a rebuild was started when one should not have been");
      },
      aggregate: () => {
        onCompute?.();
        throw new Error("a rebuild was started when one should not have been");
      },
    }),
  } as unknown as Db;
}

test("a fresh snapshot is served and not called stale", async () => {
  const snap = await getDashboardRows(
    dbWith({ rows: [ROW], computedAt: new Date(), schemaVersion: VERSION }),
  );
  assert.deepEqual(snap.rows, [ROW]);
  assert.equal(snap.stale, false);
});

test("a stale snapshot is served anyway, and says so", async () => {
  // The whole fix. Rows first, freshness second — the caller rebuilds after
  // the response has gone out.
  const snap = await getDashboardRows(
    dbWith({
      rows: [ROW],
      computedAt: new Date(Date.now() - HALF_HOUR - 1000),
      schemaVersion: VERSION,
    }),
  );
  assert.deepEqual(snap.rows, [ROW]);
  assert.equal(snap.stale, true);
});

test("a stale snapshot does not trigger a rebuild on the way past", async () => {
  // The rebuild reads collections; the stub throws if it is touched. A
  // failure here means the slow page is back.
  let touched = false;
  const snap = await getDashboardRows(
    dbWith(
      { rows: [ROW], computedAt: new Date(0), schemaVersion: VERSION },
      () => { touched = true; },
    ),
  );
  assert.equal(snap.rows.length, 1);
  assert.equal(touched, false);
});

test("a snapshot of the wrong shape does trigger a rebuild", async () => {
  // A bumped version means the logic behind a column changed, so the old
  // answer is a wrong answer rather than an old one — worth waiting for, and
  // it happens once after a deploy rather than every half hour. The stub
  // throws when the rebuild touches a collection, which is how the attempt is
  // observed.
  let touched = false;
  const snap = await getDashboardRows(
    dbWith(
      { rows: [ROW], computedAt: new Date(), schemaVersion: VERSION - 1 },
      () => { touched = true; },
    ),
  );
  assert.equal(touched, true, "no rebuild was attempted for an outdated shape");
  // And when that rebuild fails, the outdated rows still beat an error page.
  assert.deepEqual(snap.rows, [ROW]);
  assert.equal(snap.stale, true);
});

test("nothing stored and the rebuild fails is an error, not an empty market", async () => {
  // There is no list to fall back on, and a page reading "Өгөгдөл олдсонгүй"
  // would be a lie about the market rather than about this app.
  await assert.rejects(getDashboardRows(dbWith(null)), /rebuild was started/);
});
