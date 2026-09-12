import { buildScorecard, type Scorecard } from "./indicators";
import { computeRisk, type RiskMetrics } from "./risk";
import { TIMEFRAMES, type Candle, type Timeframe } from "./series";
import type { GoldPoint } from "@/lib/gold";

/**
 * The analysis a gold tracker cannot do on its own history.
 *
 * ALTT listed in May 2026 and has traded seventy-seven days. Every panel
 * under the chart wants years: the technical scorecard reads a two-hundred-
 * day average, the risk figures annualise a spread, and a fund that files no
 * accounts has no ratios at all. On its own numbers all three came out empty
 * or, worse, plausible — three months of price annualised into a "yearly
 * return" is a figure with a percent sign and no meaning.
 *
 * What the fund holds has seventeen years of daily prices behind it. So the
 * analysis is run on the metal: the same scorecard and the same risk
 * arithmetic every other listing gets, from Mongolbank's series since 2009
 * rather than from the fund's first quarter.
 *
 * It is stated as gold's, never as the fund's. The two are not the same
 * thing and the difference is itself worth reading — which is what the
 * premium below measures.
 */

/**
 * The metal as a candle series.
 *
 * A published buying price is one figure a day, not four, so open, high, low
 * and close are all it. That is honest for what the indicators do with them:
 * every moving average and oscillator the scorecard reads works off the
 * close, and the two that would use a range — ATR, and the stochastic's
 * high-low window — read a flat bar as a day that did not move against
 * itself, which for a single quoted price is exactly what happened.
 *
 * Volume is zero because there is none to state. Nothing on the scorecard
 * reads it; the chart's volume pane is not drawn from this.
 */
export function goldCandles(points: GoldPoint[]): Candle[] {
  return points.map((p) => ({
    date: p.date,
    open: p.price,
    high: p.price,
    low: p.price,
    close: p.price,
    volume: 0,
  }));
}

/** How the fund's own price stands against the metal it holds. */
export interface GoldPremium {
  /** The fund's last close. */
  price: number;
  /** A hundredth of a gram on the same day, or the last one before it. */
  gold: number;
  /** Signed percent: above zero the fund costs more than what it holds. */
  premiumPct: number;
  /** The day both figures are from. */
  date: string;
  /** Mean premium over the days both series cover, as a baseline. */
  averagePct: number | null;
  /** How many days that average is over. */
  days: number;
}

/** What the metal has returned over a span, annualised where it is longer. */
export interface GoldReturn {
  years: number;
  label: string;
  /** Total change over the span, in percent. */
  totalPct: number;
  /** The same compounded down to a year. Null for spans under one. */
  annualPct: number | null;
  from: string;
}

export interface GoldBasis {
  /** Where the series starts and ends, and how many days are in it. */
  from: string;
  to: string;
  days: number;
  scorecards: Record<Timeframe, Scorecard>;
  risk: RiskMetrics;
  riskYears: number;
  returns: GoldReturn[];
  premium: GoldPremium | null;
}

const SPANS: { years: number; label: string }[] = [
  { years: 1, label: "1 жил" },
  { years: 3, label: "3 жил" },
  { years: 5, label: "5 жил" },
  { years: 10, label: "10 жил" },
];

/**
 * What the metal has done over each span, compounded to a year.
 *
 * The fundamental question about a commodity is not a price-to-earnings
 * ratio — there are no earnings — it is what holding it has returned and
 * over how long. A span is only reported where the series actually reaches
 * back that far, so a figure is never a shorter run stretched to fit.
 */
export function goldReturns(points: GoldPoint[], today: string): GoldReturn[] {
  if (points.length < 2) return [];
  const last = points[points.length - 1];

  const rows: GoldReturn[] = [];
  for (const span of SPANS) {
    const from = `${Number(today.slice(0, 4)) - span.years}${today.slice(4)}`;
    if (points[0].date > from) continue;
    // The last quote on or before the anniversary: the bank does not publish
    // on a Sunday, and an exact match would drop the span rather than the day.
    let start = points[0];
    for (const p of points) {
      if (p.date > from) break;
      start = p;
    }
    if (start.price <= 0 || start.date === last.date) continue;
    const growth = last.price / start.price;
    rows.push({
      years: span.years,
      label: span.label,
      totalPct: (growth - 1) * 100,
      annualPct: (Math.pow(growth, 1 / span.years) - 1) * 100,
      from: start.date,
    });
  }
  // The whole series, which is the one span nobody has to have guessed the
  // length of.
  const years = (Date.parse(last.date) - Date.parse(points[0].date)) / 31_557_600_000;
  if (years >= 1 && points[0].price > 0) {
    const growth = last.price / points[0].price;
    rows.push({
      years,
      label: `${points[0].date.slice(0, 4)} оноос`,
      totalPct: (growth - 1) * 100,
      annualPct: (Math.pow(growth, 1 / years) - 1) * 100,
      from: points[0].date,
    });
  }
  return rows;
}

/**
 * The fund against the metal.
 *
 * A tracker is worth what it holds, so the one fundamental figure it has is
 * whether the market is paying more or less than that. Both sides are quoted
 * in the same unit — the fund's price, and a hundredth of a gram — which is
 * what makes the difference a percentage rather than an exchange rate.
 *
 * The average is over every day both series quote, because a single day's
 * premium says nothing on its own: a tracker that has run three percent rich
 * all year is not the same as one that went rich this morning.
 */
export function goldPremium(
  candles: Candle[],
  points: GoldPoint[],
): GoldPremium | null {
  if (candles.length === 0 || points.length === 0) return null;

  let latest: { price: number; gold: number; date: string } | null = null;
  const spread: number[] = [];

  // One pass, both in date order: the metal's last quote on or before each
  // session the fund traded.
  let i = 0;
  let gold: number | undefined;
  for (const candle of candles) {
    while (i < points.length && points[i].date <= candle.date) {
      gold = points[i].price;
      i++;
    }
    if (gold === undefined || gold <= 0) continue;
    spread.push((candle.close / gold - 1) * 100);
    latest = { price: candle.close, gold, date: candle.date };
  }
  if (!latest) return null;
  return {
    price: latest.price,
    gold: latest.gold,
    premiumPct: (latest.price / latest.gold - 1) * 100,
    date: latest.date,
    averagePct: spread.length > 0 ? spread.reduce((a, b) => a + b, 0) / spread.length : null,
    days: spread.length,
  };
}

/**
 * Everything the three panels need, computed on the metal.
 *
 * `candles` is the fund's own series and is used for one thing only — the
 * premium, which needs both sides. The scorecards and the risk figures come
 * from gold alone.
 */
export function buildGoldBasis(
  points: GoldPoint[],
  candles: Candle[],
  index: { date: string; value: number }[],
  today: string,
): GoldBasis | null {
  if (points.length < 2) return null;
  const bars = goldCandles(points);
  const coveredYears = Math.max(
    1,
    Math.ceil(
      (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) /
        31_557_600_000,
    ),
  );

  return {
    from: points[0].date,
    to: points[points.length - 1].date,
    days: points.length,
    scorecards: Object.fromEntries(
      TIMEFRAMES.map(({ key }) => [key, buildScorecard(bars, key)]),
    ) as Record<Timeframe, Scorecard>,
    // Over the whole published series, not the three years every listing is
    // compared on: this is read off the gold chart, and the gold chart is
    // seventeen years long.
    risk: computeRisk(bars, index, today, coveredYears),
    riskYears: Math.round(coveredYears),
    returns: goldReturns(points, today),
    premium: goldPremium(candles, points),
  };
}
