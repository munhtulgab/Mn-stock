/**
 * The moving-average and smoothing primitives every indicator is built from.
 *
 * Each one returns a series rather than a single figure, so an indicator that
 * feeds another — the MACD's signal line is an average of the MACD line, the
 * ADX is an average of a figure derived from two other averages — can be
 * written as a composition rather than as a loop that recomputes its inputs.
 * Positions with too little history behind them are null, never zero: a
 * twenty-day average of nine days is not a twenty-day average of anything,
 * and zero is a price.
 */

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Simple moving average at every position. */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;

  let running = 0;
  for (let i = 0; i < values.length; i++) {
    running += values[i];
    if (i >= period) running -= values[i - period];
    if (i >= period - 1) out[i] = running / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the simple average of the first
 * full window — the conventional seed, and the one that makes an EMA
 * computed here match an EMA computed anywhere else.
 */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Wilder's smoothing — the running average behind RSI, ATR and ADX.
 *
 * Not the same as an EMA of the same period: Wilder divides by the period
 * where an EMA divides by the period plus one, which is why an RSI written
 * with an EMA reads a point or two away from every published RSI.
 */
export function wilderSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let average = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = average;
  for (let i = period; i < values.length; i++) {
    average = (average * (period - 1) + values[i]) / period;
    out[i] = average;
  }
  return out;
}

/** Population standard deviation of a window ending at each position. */
export function stdevSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;

  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance =
      window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** The last non-null value of a series, or null if it has none. */
export function last<T>(series: (T | null)[]): T | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Where `value` falls among `population`, as a percentage.
 *
 * The share of the population it is at least as large as, which is the usual
 * reading of a percentile rank: 90 means it beats nine tenths of the field.
 */
export function percentileRank(value: number, population: number[]): number | null {
  if (population.length === 0) return null;
  const atOrBelow = population.filter((v) => v <= value).length;
  return (atOrBelow / population.length) * 100;
}

/* -------------------------------------------------------------------------
   Candles at a longer interval.

   The exchange publishes one candle a trading day. A weekly candle opens on
   the week's first session and closes on its last, taking the highest high
   and lowest low in between and adding up the volume — which is what makes
   the same indicator read differently over a week than over a day, and what
   the timeframe selector is selecting.
   ------------------------------------------------------------------------- */

export type Timeframe = "1D" | "1W" | "1M";

export const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "1D", label: "Өдөр" },
  { key: "1W", label: "7 хоног" },
  { key: "1M", label: "Сар" },
];

/** The Monday of the week a YYYY-MM-DD falls in. */
function weekKey(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  // getUTCDay is 0 on Sunday, which belongs to the week that began six days
  // earlier rather than to the one starting tomorrow.
  const backToMonday = (at.getUTCDay() + 6) % 7;
  at.setUTCDate(at.getUTCDate() - backToMonday);
  return at.toISOString().slice(0, 10);
}

export function aggregate(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1D") return candles;
  const keyOf = timeframe === "1W" ? weekKey : (d: string) => d.slice(0, 7);

  const out: Candle[] = [];
  let key: string | null = null;
  for (const candle of candles) {
    const candleKey = keyOf(candle.date);
    const open = out[out.length - 1];
    if (candleKey !== key || !open) {
      key = candleKey;
      out.push({ ...candle, date: candle.date });
      continue;
    }
    open.high = Math.max(open.high, candle.high);
    open.low = Math.min(open.low, candle.low);
    open.close = candle.close;
    open.volume += candle.volume;
    // Dated by its last session rather than its first, so the newest bar is
    // dated when it actually last traded rather than at the start of a week
    // that may still be running.
    open.date = candle.date;
  }
  return out;
}
