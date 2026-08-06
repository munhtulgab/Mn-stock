import type { Financials } from "@/lib/types";
import { median, percentileRank } from "./series";

/**
 * The valuation and quality ratios, each set beside what the rest of the
 * sector is trading at.
 *
 * A P/E of 8 means nothing on its own — it is cheap for a brewer and dear
 * for a coalminer — so every figure here carries the sector's median, how
 * far from it this company sits, and where in the sector it ranks. What it
 * does not carry is an invented number: a ratio whose inputs the exchange
 * did not publish is null all the way through rather than zero.
 *
 * Current Ratio is deliberately absent. It is current assets over current
 * liabilities and the exchange's summary publishes neither — only the totals
 * — so there is no honest way to compute it from what MSE makes available.
 * Nine ratios were asked for and eight are here; the ninth would have to be
 * fabricated.
 */

export type Direction = "higher" | "lower";
/** Green beats the sector, yellow matches it, red trails it. */
export type Standing = "good" | "fair" | "poor";

/** Within this much of the sector median counts as matching it. */
const FAIR_BAND = 0.1;

export interface RatioView {
  key: string;
  label: string;
  value: number | null;
  /** Which way is better, which is what makes a colour meaningful. */
  direction: Direction;
  /** Digits to print, since a P/E and a net margin do not want the same. */
  digits: number;
  suffix?: string;
  /** The sector's median, over the companies that reported the ratio. */
  sectorMedian: number | null;
  /** How this company ranks in its sector, best-first as a percentage. */
  percentile: number | null;
  standing: Standing | null;
  /** Change against the same quarter a year earlier, in the ratio's units. */
  yoy: number | null;
}

export interface RatioInputs {
  pe: number | null;
  pb: number | null;
  eps: number | null;
  bvps: number | null;
  roe: number | null;
  roa: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
}

const RATIO_META: {
  key: keyof RatioInputs;
  label: string;
  direction: Direction;
  digits: number;
  suffix?: string;
}[] = [
  { key: "pe", label: "P/E", direction: "lower", digits: 2 },
  { key: "pb", label: "P/B", direction: "lower", digits: 2 },
  { key: "eps", label: "EPS", direction: "higher", digits: 2, suffix: "₮" },
  { key: "bvps", label: "BVPS", direction: "higher", digits: 2, suffix: "₮" },
  { key: "roe", label: "ROE", direction: "higher", digits: 2, suffix: "%" },
  { key: "roa", label: "ROA", direction: "higher", digits: 2, suffix: "%" },
  { key: "netMargin", label: "Цэвэр ашгийн маржин", direction: "higher", digits: 2, suffix: "%" },
  { key: "debtToEquity", label: "Өр / Өөрийн хөрөнгө", direction: "lower", digits: 2 },
];

/**
 * The ratios one company's report yields, at a given price.
 *
 * P/E comes from the exchange rather than being recomputed: it publishes one,
 * and a second opinion differing in the third decimal because it used a
 * different day's close would be a bug report waiting to happen. The ones the
 * exchange does not publish are derived here from the figures it does.
 */
export function computeRatios(
  financials: Financials | null,
  price: number | null,
): RatioInputs {
  if (!financials) {
    return {
      pe: null, pb: null, eps: null, bvps: null,
      roe: null, roa: null, netMargin: null, debtToEquity: null,
    };
  }

  const { bookValuePerShare, equity, totalLiabilities, netProfit, revenue } = financials;

  return {
    pe: financials.pe,
    pb:
      price !== null && bookValuePerShare !== null && bookValuePerShare > 0
        ? price / bookValuePerShare
        : null,
    eps: financials.eps,
    bvps: bookValuePerShare,
    roe: financials.roe,
    roa: financials.roa,
    // Revenue means interest income for a bank and premiums for an insurer,
    // which is the closest thing each has to a top line.
    netMargin:
      netProfit !== null && revenue !== null && revenue > 0
        ? (netProfit / revenue) * 100
        : null,
    // Zero liabilities is a blank, not a debt-free balance sheet. Every one
    // of the five listed insurers files exactly 0 here, and an insurer with
    // no liabilities is an insurer with no policies; ranking them top of the
    // market for prudence would be reading an empty field as a triumph.
    debtToEquity:
      totalLiabilities !== null && totalLiabilities > 0 && equity !== null && equity > 0
        ? totalLiabilities / equity
        : null,
  };
}

/**
 * Where a figure stands against its sector.
 *
 * Only the sign of "better" differs between a P/E and an ROE, so both are
 * handled by the same comparison with the direction passed in. Within a
 * tenth either way is called a match rather than a win: the reports are
 * quarterly and the medians move, and colouring a company green for being
 * 2% cheaper than its sector would be reading noise as a finding.
 */
function standingOf(
  value: number,
  sectorMedian: number,
  direction: Direction,
): Standing {
  // The band is a proportion of the median, so a sector whose median is zero
  // has no width to it — and on this exchange that happens often, because a
  // sector like mining is half dormant shells reporting no profit at all.
  // Any difference from zero is then a real difference, and the comparison
  // is simply which side of it the company sits: an ROE of 80 against a
  // sector median of nothing is the strongest reading on the card, not a
  // company matching its peers.
  if (Math.abs(value - sectorMedian) <= Math.abs(sectorMedian) * FAIR_BAND) {
    return "fair";
  }

  // A negative figure where low is good — negative equity behind a debt
  // ratio — is the worst case, not the best. Ranking it first for being
  // lowest would be exactly backwards.
  if (direction === "lower" && value < 0) return "poor";

  const better = direction === "lower" ? value < sectorMedian : value > sectorMedian;
  return better ? "good" : "poor";
}

/**
 * The range each ratio can take and still be a fact rather than a misprint.
 *
 * The exchange publishes the occasional impossible figure — Сэндли ББСБ's
 * latest report states a return on assets of 21,910%, which would be a
 * company earning two hundred times everything it owns in a quarter. Left
 * in, a single one of those becomes the median of a five-company sector and
 * decides the colour of every peer's card. They are dropped rather than
 * shown, here and in the peer population both, because repeating a typo as
 * though it were a finding is worse than leaving a line blank.
 */
const PLAUSIBLE: Partial<Record<keyof RatioInputs, [number, number]>> = {
  // A priced company has positive earnings behind its P/E and positive book
  // behind its P/B; a thousand times either is not a valuation.
  pe: [0, 1000],
  pb: [0, 1000],
  // Percentages. A hundredfold return on assets does not happen.
  roe: [-1000, 1000],
  roa: [-1000, 1000],
  netMargin: [-1000, 1000],
  // Banks genuinely run at ten or more times equity; a hundred is a misprint.
  debtToEquity: [0, 100],
};

function plausible(key: keyof RatioInputs, value: number): boolean {
  const bounds = PLAUSIBLE[key];
  if (!bounds) return true;
  const [low, high] = bounds;
  // The bounds are exclusive at zero for the two that cannot be zero and
  // mean anything: a P/E of nothing is a company with no earnings.
  if ((key === "pe" || key === "pb") && value <= 0) return false;
  return value >= low && value <= high;
}

/**
 * A ratio is only comparable where it means what it says. A negative or zero
 * P/E is a company with no earnings to price, and including it in a median
 * would drag the sector's valuation somewhere no share is trading.
 */
function comparable(key: keyof RatioInputs, value: number | null): value is number {
  if (value === null || !Number.isFinite(value)) return false;
  return plausible(key, value);
}

/**
 * A report filed blank.
 *
 * A dozen listings file a summary with nothing in it, and the exchange
 * renders those blanks as zeroes rather than dashes: Монгол даатгал's latest
 * shows a net profit of 0, an ROE of 0, an ROA of 0 and total liabilities of
 * 0 all at once, which is not a company that broke exactly even while owing
 * nobody anything. Counting those zeroes as figures is what dragged whole
 * sectors' medians to zero, so a report with no life in it is left out of
 * the peer population entirely.
 */
export function isBlankReport(financials: Financials): boolean {
  const zeroOrNull = (v: number | null) => v === null || v === 0;
  return (
    zeroOrNull(financials.netProfit) &&
    zeroOrNull(financials.roe) &&
    zeroOrNull(financials.roa) &&
    zeroOrNull(financials.eps)
  );
}

export interface SectorPeer {
  symbol: string;
  name: string;
  ratios: RatioInputs;
}

export function buildRatioViews(
  own: RatioInputs,
  peers: SectorPeer[],
  previousYear: RatioInputs | null,
): RatioView[] {
  return RATIO_META.map(({ key, label, direction, digits, suffix }) => {
    const raw = own[key];
    const population = peers
      .map((p) => p.ratios[key])
      .filter((v): v is number => comparable(key, v));

    const sectorMedian = population.length > 0 ? median(population) : null;
    const usable = comparable(key, raw);
    // Shown only where it is comparable, so the card never prints a figure
    // it has just refused to rank — a P/E on a loss-making quarter, or the
    // exchange's occasional impossible percentage — as though it were real.
    const value = usable ? raw : null;

    // Ranked so that a high percentile is always the good end, whichever way
    // the ratio reads: cheapest P/E and highest ROE both come out near 100.
    const rank =
      value !== null && population.length > 0
        ? direction === "lower"
          ? percentileRank(-value, population.map((v) => -v))
          : percentileRank(value, population)
        : null;

    const before = previousYear?.[key] ?? null;

    return {
      key,
      label,
      value,
      direction,
      digits,
      suffix,
      sectorMedian,
      percentile: rank,
      standing:
        value !== null && sectorMedian !== null
          ? standingOf(value, sectorMedian, direction)
          : null,
      yoy:
        value !== null && before !== null && Number.isFinite(before) ? value - before : null,
    };
  });
}
