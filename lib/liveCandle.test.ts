import assert from "node:assert/strict";
import { test } from "node:test";
import { withLiveCandle } from "./liveCandle";
import type { Candle } from "./analysis/series";
import type { LiveQuote } from "./marketinfo/quotes";

/**
 * The chart, the scorecard and the risk figures all end where this says they
 * end. The exchange publishes a session only once it has closed, so without
 * today's bar every one of them stops a day short of the price the page is
 * quoting — which is exactly what was reported: a header showing Friday's
 * running price above a chart that ended on Thursday.
 */

const stored: Candle[] = [
  { date: "2026-08-05", open: 1450, high: 1460, low: 1445, close: 1458, volume: 100 },
  { date: "2026-08-06", open: 1458, high: 1462, low: 1452, close: 1458, volume: 120 },
];

function quote(partial: Partial<LiveQuote>): LiveQuote {
  return {
    symbol: "KHAN",
    companyCode: 563,
    price: 1460,
    lastTrade: 1460,
    previousClose: 1458,
    changePct: 0.14,
    open: null,
    high: null,
    low: null,
    vwap: null,
    volume: null,
    at: "2026-08-07T10:12:06+08:00",
    ...partial,
  } as LiveQuote;
}

test("today's running price is appended as its own bar", () => {
  const out = withLiveCandle(stored, quote({}));
  assert.equal(out.length, 3);
  assert.equal(out[2].date, "2026-08-07");
  assert.equal(out[2].close, 1460);
  // No stated open: it opens where yesterday closed.
  assert.equal(out[2].open, 1458);
  // No stated extremes: the bar spans what is known of it, never NaN. A
  // single undefined here turns a 52-week range into NaN.
  assert.equal(out[2].high, 1460);
  assert.equal(out[2].low, 1458);
  assert.ok(Number.isFinite(out[2].volume));
});

test("a quote for a day already published replaces it rather than doubling", () => {
  const out = withLiveCandle(stored, quote({ at: "2026-08-06T14:00:00+08:00", price: 1470 }));
  assert.equal(out.length, 2);
  assert.equal(out[1].date, "2026-08-06");
  assert.equal(out[1].close, 1470);
  // The bar it replaces opened where the session before it closed, not where
  // the row it is overwriting did.
  assert.equal(out[1].open, 1458);
});

test("a stale quote never rewrites history", () => {
  const out = withLiveCandle(stored, quote({ at: "2026-08-04T10:00:00+08:00", price: 1 }));
  assert.deepEqual(out, stored);
});

test("no quote, no timestamp and no price all leave the series alone", () => {
  assert.deepEqual(withLiveCandle(stored, null), stored);
  assert.deepEqual(withLiveCandle(stored, undefined), stored);
  assert.deepEqual(withLiveCandle(stored, quote({ at: null })), stored);
  assert.deepEqual(withLiveCandle(stored, quote({ price: null })), stored);
});

test("stated open, high, low and volume are used as given", () => {
  const out = withLiveCandle(
    stored,
    quote({ open: 1455, high: 1475, low: 1450, volume: 5000 }),
  );
  assert.deepEqual(out[2], {
    date: "2026-08-07",
    open: 1455,
    high: 1475,
    low: 1450,
    close: 1460,
    volume: 5000,
  });
});

test("an empty history still gains today's bar", () => {
  const out = withLiveCandle([], quote({}));
  assert.equal(out.length, 1);
  assert.equal(out[0].close, 1460);
  // Nothing behind it to open from, so it opens at its own price.
  assert.equal(out[0].open, 1460);
});
