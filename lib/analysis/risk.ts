import type { Candle } from "./series";

/**
 * What a holding in this security has actually done to a portfolio: how far
 * it swings, how far it has fallen, how much of its return was paid for in
 * volatility, and how much of its movement is the market's rather than its
 * own.
 *
 * All of it is measured from the last three years of daily closes against
 * the exchange's own TOP-20 index. Three years because it is long enough for
 * a beta to mean something and short enough to still describe the company
 * that exists now; a listing younger than the minimum below gets nulls
 * rather than a figure computed from a fortnight.
 */

/** Trading days in a year on MSE, near enough for annualising. */
const TRADING_DAYS = 248;
/** Sessions the two series must share before any of this is worth printing. */
const MIN_OVERLAP = 60;
/**
 * The share of the market's sessions this security must itself have traded
 * in before a beta is reported.
 *
 * On MSE most listings do not trade most days, and a security that changes
 * hands once a fortnight has its fortnight's move paired against the index's
 * single day. That does not measure a lower beta from thin trading, it
 * measures the wrong thing: a security moving at exactly twice the market
 * comes out at 2.5 when only every third session is present. There is no
 * daily beta for a security without daily prices, so none is shown.
 */
const MIN_SESSION_COVERAGE = 0.5;
/**
 * Annualised volatility below which a risk-adjusted ratio is not reported.
 *
 * Sharpe divides by volatility, so a security whose price barely moves
 * returns an enormous number that reads as a spectacular investment when
 * what it actually means is that the denominator is nearly zero. Half a
 * percent a year is already far below anything genuinely traded.
 */
const MIN_VOLATILITY = 0.005;
/** The window every figure here describes. */
export const RISK_YEARS = 3;

/**
 * The return an investor could have had without taking any risk, annualised.
 *
 * The Bank of Mongolia's policy rate, which is what a tugrik deposit is
 * priced off. It is the subtraction that makes a Sharpe ratio mean "paid for
 * the risk" rather than just "went up", and in a market with double-digit
 * rates leaving it at zero would flatter every listing on the exchange.
 */
export const RISK_FREE_RATE = 0.1;

export interface RiskMetrics {
  /** Sessions both series traded in, which everything here is computed over. */
  overlap: number;
  /** Against TOP-20. 1 means it moves with the market, 2 twice as hard. */
  beta: number | null;
  /** Annualised standard deviation of daily returns, as a percentage. */
  volatility: number | null;
  /** Excess return per unit of total volatility. */
  sharpe: number | null;
  /** Excess return per unit of downside volatility only. */
  sortino: number | null;
  /** The daily loss exceeded one session in twenty, as a positive percentage. */
  var95: number | null;
  /** Deepest peak-to-trough fall in the window, as a positive percentage. */
  maxDrawdown: number | null;
  /** Annualised return over the window, as a percentage. */
  annualReturn: number | null;
}

const EMPTY: RiskMetrics = {
  overlap: 0,
  beta: null,
  volatility: null,
  sharpe: null,
  sortino: null,
  var95: null,
  maxDrawdown: null,
  annualReturn: null,
};

/** Simple returns between consecutive closes, keyed by the later date. */
function returnsByDate(points: { date: string; close: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1].close;
    if (previous > 0) out.set(points[i].date, points[i].close / previous - 1);
  }
  return out;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Sample rather than population: these are a sample of the security's
  // behaviour, not the whole of it.
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * The loss exceeded 5% of the time, by the historical method.
 *
 * No normal distribution is assumed. A market where a third of the listings
 * do not trade on a given day does not produce bell-shaped returns, and a
 * parametric VaR would quietly understate exactly the tail it is meant to
 * measure.
 */
function historicalVar(returns: number[], confidence = 0.95): number | null {
  if (returns.length < 20) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  const quantile = sorted[Math.min(index, sorted.length - 1)];
  // Reported as the size of the loss, so a bigger number is a worse day.
  return quantile < 0 ? -quantile * 100 : 0;
}

function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    if (peak > 0) worst = Math.max(worst, (peak - close) / peak);
  }
  return worst * 100;
}

/**
 * How much of this security's movement is the market's.
 *
 * Only sessions in which both the security and the index traded are used.
 * Pairing them by position instead would compare a thinly traded company's
 * March with the index's June and produce a beta from two unrelated series.
 */
function beta(stock: number[], index: number[]): number | null {
  if (stock.length < 2) return null;
  const stockMean = stock.reduce((a, b) => a + b, 0) / stock.length;
  const indexMean = index.reduce((a, b) => a + b, 0) / index.length;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < stock.length; i++) {
    covariance += (stock[i] - stockMean) * (index[i] - indexMean);
    variance += (index[i] - indexMean) ** 2;
  }
  if (variance === 0) return null;
  return covariance / variance;
}

/**
 * @param window how many years back to measure. Three by default, which is the
 *   window every listing is compared over. The gold basis passes its own
 *   because the chart it is read from is the whole published series, and a
 *   panel that says three years beside a chart that says seventeen is two
 *   answers to one question.
 */
export function computeRisk(
  candles: Candle[],
  indexSeries: { date: string; value: number }[],
  today: string,
  window = RISK_YEARS,
): RiskMetrics {
  const from = `${Number(today.slice(0, 4)) - window}${today.slice(4)}`;
  const windowed = candles.filter((c) => c.date >= from);
  if (windowed.length < 2) return EMPTY;

  const stockReturns = returnsByDate(windowed);
  const indexReturns = returnsByDate(
    indexSeries.filter((p) => p.date >= from).map((p) => ({ date: p.date, close: p.value })),
  );

  // Paired by date, so a session the security sat out is not silently
  // matched against whatever the index did next.
  const paired: { stock: number; index: number }[] = [];
  for (const [date, value] of stockReturns) {
    const market = indexReturns.get(date);
    if (market !== undefined) paired.push({ stock: value, index: market });
  }

  const own = [...stockReturns.values()];
  if (own.length < MIN_OVERLAP) return { ...EMPTY, overlap: paired.length };

  const daily = stdev(own);
  const volatility = daily === null ? null : daily * Math.sqrt(TRADING_DAYS);

  // Compounded over the window and then annualised, rather than the mean
  // daily return multiplied out: a security that halved and doubled has a
  // positive mean daily return and has gone nowhere.
  const first = windowed[0].close;
  const lastClose = windowed[windowed.length - 1].close;
  const years = own.length / TRADING_DAYS;
  const annualReturn =
    first > 0 && lastClose > 0 && years > 0
      ? ((lastClose / first) ** (1 / years) - 1) * 100
      : null;

  const excess = annualReturn === null ? null : annualReturn / 100 - RISK_FREE_RATE;
  const downside = own.filter((r) => r < 0);
  const downsideDeviation =
    downside.length < 2 ? null : (stdev(downside) ?? 0) * Math.sqrt(TRADING_DAYS);

  // Enough of the market's own sessions to be measuring a daily relationship
  // rather than a fortnight against a day.
  const tradedEnough =
    paired.length >= MIN_OVERLAP &&
    indexReturns.size > 0 &&
    paired.length / indexReturns.size >= MIN_SESSION_COVERAGE;

  const ratiosMeaningful = volatility !== null && volatility >= MIN_VOLATILITY;

  return {
    overlap: paired.length,
    beta: tradedEnough
      ? beta(paired.map((p) => p.stock), paired.map((p) => p.index))
      : null,
    volatility: volatility === null ? null : volatility * 100,
    sharpe:
      excess === null || !ratiosMeaningful ? null : excess / volatility!,
    sortino:
      excess === null || !ratiosMeaningful || !downsideDeviation
        ? null
        : excess / downsideDeviation,
    var95: historicalVar(own),
    maxDrawdown: maxDrawdown(windowed.map((c) => c.close)),
    annualReturn,
  };
}
