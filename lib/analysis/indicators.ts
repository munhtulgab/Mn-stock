import {
  aggregate,
  emaSeries,
  last,
  smaSeries,
  stdevSeries,
  wilderSeries,
  type Candle,
  type Timeframe,
} from "./series";

/**
 * The eight oscillators and the six moving averages a technical summary is
 * made of, each read as a buy, a sell or neither.
 *
 * The thresholds are the conventional ones — an RSI is overbought at 70
 * whoever is reading it — so that a figure here can be checked against any
 * other terminal rather than being this app's private opinion. What the app
 * decides is only what to do with the tally, and that is in `signal.ts`.
 *
 * Every reading carries the number it was decided from as well as the
 * verdict. A scorecard that says SELL without saying the RSI was 78 is
 * asking to be taken on trust, and the whole point of showing the working
 * is that it need not be.
 */

export type Verdict = "BUY" | "NEUTRAL" | "SELL";

export interface Reading {
  key: string;
  /** As it appears on the card. */
  label: string;
  /** The figure the verdict was read from, already rounded for display. */
  value: number | null;
  /** A second figure where one number does not describe the indicator. */
  detail?: string;
  verdict: Verdict | null;
}

export interface Scorecard {
  timeframe: Timeframe;
  /** The interval's candles that were available to compute from. */
  bars: number;
  oscillators: Reading[];
  movingAverages: Reading[];
  counts: { buy: number; sell: number; neutral: number };
  /** Every reading that produced a verdict, oscillators and averages alike. */
  summary: Verdict;
}

/** Periods for the six moving averages, in bars of whatever the interval is. */
const MA_PERIODS = [5, 10, 20, 50, 100, 200];

/** How far above or below its own average OBV must sit to mean anything. */
const OBV_PERIOD = 20;

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ---------------------------------------------------------------- oscillators */

/**
 * Relative Strength Index, Wilder's original.
 *
 * A market that only rose over the window has no average loss to divide by;
 * that is an RSI of 100 rather than an error, and the same in reverse.
 */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }

  const avgGain = wilderSeries(gains, period);
  const avgLoss = wilderSeries(losses, period);
  for (let i = 0; i < gains.length; i++) {
    const up = avgGain[i];
    const down = avgLoss[i];
    if (up === null || down === null) continue;
    // Offset by one: gains[i] is the change into closes[i + 1].
    out[i + 1] = down === 0 ? 100 : 100 - 100 / (1 + up / down);
  }
  return out;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number | null; signal: number | null; histogram: number | null } {
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);

  // The MACD line only exists where both averages do, and the signal line is
  // an average of that line — so it is computed over the defined stretch and
  // not over an array with nulls punched through the front of it.
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) line.push(fastEma[i]! - slowEma[i]!);
  }
  if (line.length === 0) return { macd: null, signal: null, histogram: null };

  const macdValue = line[line.length - 1];
  const signal = last(emaSeries(line, signalPeriod));
  return {
    macd: macdValue,
    signal,
    histogram: signal === null ? null : macdValue - signal,
  };
}

export function bollinger(
  closes: number[],
  period = 20,
  deviations = 2,
): { upper: number | null; middle: number | null; lower: number | null } {
  const middle = last(smaSeries(closes, period));
  const deviation = last(stdevSeries(closes, period));
  if (middle === null || deviation === null) {
    return { upper: null, middle, lower: null };
  }
  return {
    upper: middle + deviations * deviation,
    middle,
    lower: middle - deviations * deviation,
  };
}

/** True range per bar; the first bar has no previous close to reach back to. */
function trueRanges(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    out.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number | null {
  return last(wilderSeries(trueRanges(candles), period));
}

/**
 * Average Directional Index with the two directional indicators it is
 * derived from.
 *
 * The ADX alone says only how strongly the market is trending, not which
 * way; +DI against −DI is what supplies the direction, which is why all
 * three come back together and the verdict needs all three.
 */
export function adx(
  candles: Candle[],
  period = 14,
): { adx: number | null; plusDi: number | null; minusDi: number | null } {
  if (candles.length < period * 2) return { adx: null, plusDi: null, minusDi: null };

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    // A bar counts for one direction or neither, never both: an outside bar
    // that exceeded yesterday in both directions is credited to the larger.
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const tr = wilderSeries(trueRanges(candles), period);
  const plus = wilderSeries(plusDm, period);
  const minus = wilderSeries(minusDm, period);

  const dx: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (tr[i] === null || plus[i] === null || minus[i] === null || tr[i] === 0) continue;
    const plusDi = (100 * plus[i]!) / tr[i]!;
    const minusDi = (100 * minus[i]!) / tr[i]!;
    const sum = plusDi + minusDi;
    if (sum === 0) continue;
    dx.push((100 * Math.abs(plusDi - minusDi)) / sum);
  }

  const lastTr = last(tr);
  const lastPlus = last(plus);
  const lastMinus = last(minus);
  return {
    adx: last(wilderSeries(dx, period)),
    plusDi: lastTr && lastPlus !== null ? (100 * lastPlus) / lastTr : null,
    minusDi: lastTr && lastMinus !== null ? (100 * lastMinus) / lastTr : null,
  };
}

export function stochastic(
  candles: Candle[],
  period = 14,
  smoothing = 3,
): { k: number | null; d: number | null } {
  if (candles.length < period) return { k: null, d: null };

  const raw: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));
    // A security that traded at one price all fortnight has no range to sit
    // in; the middle is the only honest answer.
    raw.push(high === low ? 50 : ((candles[i].close - low) / (high - low)) * 100);
  }

  return { k: raw[raw.length - 1] ?? null, d: last(smaSeries(raw, smoothing)) };
}

/**
 * On-Balance Volume, and the average of itself that gives it a direction.
 *
 * The running total is arbitrary on its own — it depends on where the series
 * happens to start — so what is read is whether it is above or below its own
 * recent average, which is not.
 */
export function obv(candles: Candle[]): { value: number | null; average: number | null } {
  if (candles.length < 2) return { value: null, average: null };

  const series: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const direction = Math.sign(candles[i].close - candles[i - 1].close);
    series.push(series[i - 1] + direction * candles[i].volume);
  }
  return { value: series[series.length - 1], average: last(smaSeries(series, OBV_PERIOD)) };
}

export function roc(closes: number[], period = 12): number | null {
  if (closes.length <= period) return null;
  const then = closes[closes.length - 1 - period];
  if (!then) return null;
  return ((closes[closes.length - 1] - then) / then) * 100;
}

/* ------------------------------------------------------------------ verdicts */

/** Overbought above, oversold below — the levels every terminal draws. */
const RSI_HIGH = 70;
const RSI_LOW = 30;
const STOCH_HIGH = 80;
const STOCH_LOW = 20;
/** Below this the ADX says there is no trend to be with or against. */
const ADX_TRENDING = 20;

function bandVerdict(value: number | null, low: number, high: number): Verdict | null {
  if (value === null) return null;
  // A reading at an extreme is a reading that the move is stretched, so an
  // oversold market is the buy. This is the convention every published
  // technical summary uses, and disagreeing with it silently would make the
  // card unreadable against any other one.
  if (value <= low) return "BUY";
  if (value >= high) return "SELL";
  return "NEUTRAL";
}

/**
 * One figure against another — a price against its average, the MACD against
 * its signal line.
 *
 * Equal counts as neither, and "equal" has to mean nearly equal. These are
 * sums of hundreds of divisions, so a price sitting exactly on its own
 * moving average comes out a quadrillionth below it about half the time,
 * and a strict `<` turns that into a SELL. The tolerance scales with the
 * figures being compared because they are tugriks here and index points
 * there and cumulative share volume in the third place.
 */
function crossVerdict(value: number | null, against: number | null): Verdict | null {
  if (value === null || against === null) return null;
  const tolerance = 1e-9 * Math.max(Math.abs(value), Math.abs(against), 1);
  if (value > against + tolerance) return "BUY";
  if (value < against - tolerance) return "SELL";
  return "NEUTRAL";
}

/**
 * The eight oscillators, read at whatever interval the candles are in.
 */
function oscillatorReadings(candles: Candle[]): Reading[] {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? null;

  const rsi = last(rsiSeries(closes));
  const macdValues = macd(closes);
  const bands = bollinger(closes);
  const directional = adx(candles);
  const stoch = stochastic(candles);
  const atrValue = atr(candles);
  const balance = obv(candles);
  const rateOfChange = roc(closes);

  // A band verdict compares the price with the bands rather than reading one
  // number, so it is spelled out rather than run through bandVerdict.
  const bandVerdictValue: Verdict | null =
    price === null || bands.upper === null || bands.lower === null
      ? null
      : price <= bands.lower
        ? "BUY"
        : price >= bands.upper
          ? "SELL"
          : "NEUTRAL";

  const adxVerdict: Verdict | null =
    directional.adx === null || directional.plusDi === null || directional.minusDi === null
      ? null
      : directional.adx < ADX_TRENDING
        ? "NEUTRAL"
        : directional.plusDi > directional.minusDi
          ? "BUY"
          : "SELL";

  return [
    {
      key: "rsi",
      label: "RSI(14)",
      value: round(rsi),
      verdict: bandVerdict(rsi, RSI_LOW, RSI_HIGH),
    },
    {
      key: "macd",
      label: "MACD(12,26)",
      value: round(macdValues.macd),
      detail:
        macdValues.signal === null
          ? undefined
          : `дохио ${round(macdValues.signal)?.toLocaleString("mn-MN") ?? "—"}`,
      verdict: crossVerdict(macdValues.macd, macdValues.signal),
    },
    {
      key: "bollinger",
      label: "Bollinger(20,2)",
      value: round(bands.middle),
      detail:
        bands.lower === null || bands.upper === null
          ? undefined
          : `${round(bands.lower)} – ${round(bands.upper)}`,
      verdict: bandVerdictValue,
    },
    {
      key: "adx",
      label: "ADX(14)",
      value: round(directional.adx),
      detail:
        directional.plusDi === null || directional.minusDi === null
          ? undefined
          : `+DI ${round(directional.plusDi, 1)} / −DI ${round(directional.minusDi, 1)}`,
      verdict: adxVerdict,
    },
    {
      key: "stochastic",
      label: "Stochastic(14,3)",
      value: round(stoch.k),
      detail: stoch.d === null ? undefined : `%D ${round(stoch.d, 1)}`,
      verdict: bandVerdict(stoch.k, STOCH_LOW, STOCH_HIGH),
    },
    {
      key: "atr",
      label: "ATR(14)",
      value: round(atrValue),
      // Volatility has no side. It is on the card because how much a price
      // moves in a day is what a stop is set from, but counting it as a buy
      // or a sell would be inventing a direction it does not have.
      detail:
        atrValue === null || price === null || price === 0
          ? undefined
          : `ханшийн ${round((atrValue / price) * 100, 1)}%`,
      verdict: atrValue === null ? null : "NEUTRAL",
    },
    {
      key: "obv",
      label: "OBV",
      value: round(balance.value, 0),
      detail:
        balance.average === null
          ? undefined
          : `${OBV_PERIOD} үеийн дундаж ${round(balance.average, 0)?.toLocaleString("mn-MN")}`,
      verdict: crossVerdict(balance.value, balance.average),
    },
    {
      key: "roc",
      label: "ROC(12)",
      value: round(rateOfChange),
      verdict:
        rateOfChange === null ? null : rateOfChange > 0 ? "BUY" : rateOfChange < 0 ? "SELL" : "NEUTRAL",
    },
  ];
}

/**
 * The six moving averages against the price.
 *
 * Above its average is a buy and below it a sell — the plainest reading
 * there is, and the one that makes a row of six of them describe the shape
 * of a trend rather than repeat one fact six times.
 */
function movingAverageReadings(candles: Candle[]): Reading[] {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? null;

  return MA_PERIODS.map((period) => {
    const value = last(smaSeries(closes, period));
    return {
      key: `ma${period}`,
      label: `MA${period}`,
      value: round(value),
      verdict: crossVerdict(price, value),
    };
  });
}

export function buildScorecard(
  daily: Candle[],
  timeframe: Timeframe,
): Scorecard {
  const candles = aggregate(daily, timeframe);
  const oscillators = oscillatorReadings(candles);
  const movingAverages = movingAverageReadings(candles);

  const verdicts = [...oscillators, ...movingAverages]
    .map((r) => r.verdict)
    .filter((v): v is Verdict => v !== null);

  const counts = {
    buy: verdicts.filter((v) => v === "BUY").length,
    sell: verdicts.filter((v) => v === "SELL").length,
    neutral: verdicts.filter((v) => v === "NEUTRAL").length,
  };

  return {
    timeframe,
    bars: candles.length,
    oscillators,
    movingAverages,
    counts,
    summary: counts.buy > counts.sell ? "BUY" : counts.sell > counts.buy ? "SELL" : "NEUTRAL",
  };
}
