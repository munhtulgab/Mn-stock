import {
  emaSeries,
  smaSeries,
  stdevSeries,
  wilderSeries,
  type Candle,
} from "./series";
import { rsiSeries } from "./indicators";

/**
 * The same indicators the scorecard reads, but at every bar rather than only
 * at the last one.
 *
 * The scorecard needs one number per indicator and says so; a chart needs the
 * whole line. Keeping the two apart means the scorecard's arithmetic — which
 * is checked against Wilder's own worked example — is not disturbed by the
 * needs of drawing, and the shared primitives underneath guarantee the line
 * ends exactly where the scorecard's figure says it does.
 */

export interface MacdSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/**
 * Spreads a series computed over a compacted array back onto the original
 * positions. The MACD signal line is an average of the MACD line, which
 * itself only exists once both its averages do, so it has to be computed
 * over the defined stretch and then put back where it belongs.
 */
function realign(
  values: (number | null)[],
  computed: (number | null)[],
  firstDefined: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 0; i < computed.length; i++) out[firstDefined + i] = computed[i];
  return out;
}

export function macdSeries(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdSeries {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);

  const line: (number | null)[] = closes.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null ? fastEma[i]! - slowEma[i]! : null,
  );

  const firstDefined = line.findIndex((v) => v !== null);
  if (firstDefined === -1) {
    const empty = closes.map(() => null);
    return { macd: empty, signal: empty, histogram: empty };
  }

  const compact = line.slice(firstDefined) as number[];
  const signal = realign(line, emaSeries(compact, signalPeriod), firstDefined);

  return {
    macd: line,
    signal,
    histogram: line.map((v, i) =>
      v !== null && signal[i] !== null ? v - signal[i]! : null,
    ),
  };
}

export function bollingerSeries(
  closes: number[],
  period = 20,
  deviations = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = smaSeries(closes, period);
  const deviation = stdevSeries(closes, period);
  return {
    middle,
    upper: middle.map((m, i) =>
      m !== null && deviation[i] !== null ? m + deviations * deviation[i]! : null,
    ),
    lower: middle.map((m, i) =>
      m !== null && deviation[i] !== null ? m - deviations * deviation[i]! : null,
    ),
  };
}

function trueRanges(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const previous = candles[i - 1].close;
    out.push(
      Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous)),
    );
  }
  return out;
}

/** True range is measured against the previous bar, so bar zero has none. */
function shift(values: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(length).fill(null);
  for (let i = 0; i < values.length; i++) out[i + 1] = values[i];
  return out;
}

export function atrSeries(candles: Candle[], period = 14): (number | null)[] {
  return shift(wilderSeries(trueRanges(candles), period), candles.length);
}

export function adxSeries(
  candles: Candle[],
  period = 14,
): { adx: (number | null)[]; plusDi: (number | null)[]; minusDi: (number | null)[] } {
  const blank = candles.map(() => null);
  if (candles.length < period * 2) {
    return { adx: blank, plusDi: blank, minusDi: blank };
  }

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }

  const tr = wilderSeries(trueRanges(candles), period);
  const plus = wilderSeries(plusDm, period);
  const minus = wilderSeries(minusDm, period);

  const plusDi = tr.map((t, i) => (t && plus[i] !== null ? (100 * plus[i]!) / t : null));
  const minusDi = tr.map((t, i) => (t && minus[i] !== null ? (100 * minus[i]!) / t : null));

  // DX only exists where both directional indicators do, so it is compacted
  // before smoothing and put back afterwards, same as the MACD signal.
  const dx: (number | null)[] = plusDi.map((p, i) => {
    const m = minusDi[i];
    if (p === null || m === null || p + m === 0) return null;
    return (100 * Math.abs(p - m)) / (p + m);
  });

  const firstDefined = dx.findIndex((v) => v !== null);
  const adx =
    firstDefined === -1
      ? dx.map(() => null)
      : realign(dx, wilderSeries(dx.slice(firstDefined) as number[], period), firstDefined);

  return {
    adx: shift(adx, candles.length),
    plusDi: shift(plusDi, candles.length),
    minusDi: shift(minusDi, candles.length),
  };
}

export function stochasticSeries(
  candles: Candle[],
  period = 14,
  smoothing = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  const raw: number[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));
    // A security that traded at one price all fortnight has no range to sit
    // in; the middle is the only honest answer.
    const value = high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100;
    raw.push(value);
    k[i] = value;
  }

  const d = realign(k, smaSeries(raw, smoothing), period - 1);
  return { k, d };
}

export function obvSeries(candles: Candle[]): (number | null)[] {
  if (candles.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    out.push(out[i - 1] + Math.sign(candles[i].close - candles[i - 1].close) * candles[i].volume);
  }
  return out;
}

export function rocSeries(closes: number[], period = 12): (number | null)[] {
  return closes.map((close, i) => {
    if (i < period) return null;
    const then = closes[i - period];
    return then ? ((close - then) / then) * 100 : null;
  });
}

/** Moving-average periods the chart can lay over the price. */
export const OVERLAY_MA_PERIODS = [5, 10, 20, 50, 100, 200] as const;

/**
 * One row per bar carrying every indicator, ready to hand to the chart.
 *
 * Computed once for the whole windowed series rather than per pane: eight
 * oscillators and six averages over a decade of candles is a lot of
 * arithmetic to repeat, and every pane is drawn from the same rows anyway.
 */
export interface PlotRow extends Candle {
  /** Low-to-high, which the candle body is scaled inside. */
  range: [number, number];
  /** Signed so a falling session's volume bar can be coloured. */
  rising: boolean;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma50: number | null;
  ma100: number | null;
  ma200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  stochK: number | null;
  stochD: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  atr: number | null;
  obv: number | null;
  roc: number | null;
}

export function buildPlotRows(candles: Candle[]): PlotRow[] {
  const closes = candles.map((c) => c.close);

  const ma = Object.fromEntries(
    OVERLAY_MA_PERIODS.map((period) => [period, smaSeries(closes, period)]),
  ) as Record<number, (number | null)[]>;

  const bands = bollingerSeries(closes);
  const rsi = rsiSeries(closes);
  const macd = macdSeries(closes);
  const stoch = stochasticSeries(candles);
  const directional = adxSeries(candles);
  const atr = atrSeries(candles);
  const obv = obvSeries(candles);
  const roc = rocSeries(closes);

  return candles.map((candle, i) => ({
    ...candle,
    range: [candle.low, candle.high] as [number, number],
    rising: candle.close >= candle.open,
    ma5: ma[5][i],
    ma10: ma[10][i],
    ma20: ma[20][i],
    ma50: ma[50][i],
    ma100: ma[100][i],
    ma200: ma[200][i],
    bbUpper: bands.upper[i],
    bbMiddle: bands.middle[i],
    bbLower: bands.lower[i],
    rsi: rsi[i],
    macd: macd.macd[i],
    macdSignal: macd.signal[i],
    macdHistogram: macd.histogram[i],
    stochK: stoch.k[i],
    stochD: stoch.d[i],
    adx: directional.adx[i],
    plusDi: directional.plusDi[i],
    minusDi: directional.minusDi[i],
    atr: atr[i],
    obv: obv[i],
    roc: roc[i],
  }));
}
