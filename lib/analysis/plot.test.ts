import assert from "node:assert/strict";
import { test } from "node:test";
import { adx, atr, bollinger, macd, obv, roc, stochastic } from "./indicators";
import {
  adxSeries,
  atrSeries,
  bollingerSeries,
  buildPlotRows,
  macdSeries,
  obvSeries,
  rocSeries,
  stochasticSeries,
} from "./plot";
import { last, type Candle } from "./series";

/**
 * The chart draws from one set of functions and the scorecard reads from
 * another. They must agree: a line that ends somewhere other than the figure
 * printed beside it is the kind of contradiction a reader is entitled to
 * treat as a bug in the numbers rather than in the drawing.
 */

/** A series with enough shape in it to exercise every branch. */
function fixture(count: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    // Deterministic, and it both trends and reverses.
    price *= 1 + Math.sin(i / 7) * 0.02 + Math.cos(i / 23) * 0.01;
    const open = price * (1 - Math.sin(i / 5) * 0.004);
    const high = Math.max(open, price) * 1.006;
    const low = Math.min(open, price) * 0.994;
    out.push({
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      open,
      high,
      low,
      close: price,
      volume: 1000 + ((i * 37) % 500),
    });
  }
  return out;
}

const candles = fixture(400);
const closes = candles.map((c) => c.close);
const near = (a: number | null, b: number | null, label: string) => {
  assert.ok(a !== null && b !== null, `${label}: one side is null (${a}, ${b})`);
  assert.ok(
    Math.abs(a! - b!) < 1e-6,
    `${label}: series ends at ${a}, scorecard reads ${b}`,
  );
};

test("MACD series ends where the scorecard reads", () => {
  const series = macdSeries(closes);
  const scalar = macd(closes);
  near(last(series.macd), scalar.macd, "macd");
  near(last(series.signal), scalar.signal, "signal");
  near(last(series.histogram), scalar.histogram, "histogram");
});

test("Bollinger series ends where the scorecard reads", () => {
  const series = bollingerSeries(closes);
  const scalar = bollinger(closes);
  near(last(series.upper), scalar.upper, "upper");
  near(last(series.middle), scalar.middle, "middle");
  near(last(series.lower), scalar.lower, "lower");
});

test("ADX series ends where the scorecard reads", () => {
  const series = adxSeries(candles);
  const scalar = adx(candles);
  near(last(series.adx), scalar.adx, "adx");
  near(last(series.plusDi), scalar.plusDi, "+DI");
  near(last(series.minusDi), scalar.minusDi, "-DI");
});

test("Stochastic series ends where the scorecard reads", () => {
  const series = stochasticSeries(candles);
  const scalar = stochastic(candles);
  near(last(series.k), scalar.k, "%K");
  near(last(series.d), scalar.d, "%D");
});

test("ATR, OBV and ROC series end where the scorecard reads", () => {
  near(last(atrSeries(candles)), atr(candles), "atr");
  near(last(obvSeries(candles)), obv(candles).value, "obv");
  near(last(rocSeries(closes)), roc(closes), "roc");
});

test("every indicator is aligned to its own bar", () => {
  const rows = buildPlotRows(candles);
  assert.equal(rows.length, candles.length);

  // Each row keeps its own candle: an off-by-one in the shifting done for
  // true-range-based indicators would show up here first.
  rows.forEach((row, i) => {
    assert.equal(row.date, candles[i].date);
    assert.equal(row.close, candles[i].close);
  });

  // The warm-up is null rather than zero, and the leading gap is exactly as
  // long as the period requires.
  assert.equal(rows[0].ma20, null);
  assert.equal(rows[18].ma20, null);
  assert.notEqual(rows[19].ma20, null);
  assert.equal(rows[0].rsi, null);
  assert.equal(rows[0].atr, null);
  // True range needs a previous bar, so bar 0 can never carry one.
  assert.equal(rows[0].adx, null);
});

test("a series too short for an indicator yields nulls, not zeroes", () => {
  const rows = buildPlotRows(fixture(5));
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.ma200, null);
    assert.equal(row.adx, null);
    assert.equal(row.macd, null);
  }
  // OBV is a running total and is defined from the first bar onward.
  assert.equal(rows[0].obv, 0);
});
