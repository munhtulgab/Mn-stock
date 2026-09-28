import type { Signal } from "@/lib/types";
import type { Scorecard } from "./indicators";
import type { RatioView } from "./fundamentals";
import type { RiskMetrics } from "./risk";

/**
 * One verdict out of the three readings, and an honest account of how much
 * it should be trusted.
 *
 * The technical scorecard, the sector-relative fundamentals and the risk
 * figures each vote, weighted by how much they are worth: the fundamentals
 * most, because a quarterly report is a fact where an oscillator is an
 * opinion; the technicals next; risk least, and only ever as a brake.
 *
 * The confidence is not a probability and is not presented as one. It says
 * how much of the evidence was available and how far the parts agreed —
 * three readings pointing the same way on a company with a full set of
 * figures is a confident HOLD; two of them missing is not.
 */

const WEIGHTS = { fundamental: 0.45, technical: 0.35, risk: 0.2 };

/** Score past which the combined reading stops being a HOLD. */
const ACT_THRESHOLD = 15;

/** Beta above this is a security that moves harder than the market. */
const HIGH_BETA = 1.3;
/** Annualised volatility, in percent, past which position size is the point. */
const HIGH_VOLATILITY = 60;

export interface CombinedSignal {
  signal: Signal;
  /** −100 to 100. Negative is a sell. */
  score: number;
  /** 0 to 100: how much evidence there was, and how far it agreed. */
  confidence: number;
  parts: {
    technical: number | null;
    fundamental: number | null;
    risk: number | null;
  };
  reasons: string[];
}

/**
 * The scorecard's tally as a score from −100 to 100.
 *
 * Measured against the readings that produced a verdict rather than against
 * fourteen, so a security with too little history for the long averages is
 * not scored as though every missing one were a neutral.
 */
function technicalScore(scorecard: Scorecard): number | null {
  const { buy, sell, neutral } = scorecard.counts;
  const total = buy + sell + neutral;
  if (total === 0) return null;
  return ((buy - sell) / total) * 100;
}

/**
 * The fundamentals as a score, from where the company ranks in its sector.
 *
 * A percentile is already a comparison against the right peer group, so the
 * average of them — centred so that the sector's median company scores zero
 * — is what "cheap and profitable for what it is" comes to.
 */
function fundamentalScore(ratios: RatioView[]): number | null {
  const ranked = ratios
    .map((r) => r.percentile)
    .filter((p): p is number => p !== null);
  if (ranked.length === 0) return null;
  const average = ranked.reduce((a, b) => a + b, 0) / ranked.length;
  return (average - 50) * 2;
}

/**
 * Where the market's risk figures fall, for measuring one company against.
 *
 * Each list is every listed company's figure, sorted ascending. Built from
 * the whole-market pass (see `buildCombinedSignals`) and stored, so a single
 * company's page measures against the same market the home list did.
 */
export interface RiskBenchmark {
  volatility: number[];
  maxDrawdown: number[];
  sharpe: number[];
}

/**
 * Below this many companies with a full three-year reading, the market is
 * too thin to rank against and the old fixed thresholds are used instead.
 */
const MIN_BENCHMARK = 20;

export function buildRiskBenchmark(all: RiskMetrics[]): RiskBenchmark | null {
  const pick = (f: (r: RiskMetrics) => number | null) =>
    all
      .map(f)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .sort((x, y) => x - y);
  const benchmark = {
    volatility: pick((r) => r.volatility),
    maxDrawdown: pick((r) => r.maxDrawdown),
    sharpe: pick((r) => r.sharpe),
  };
  return benchmark.volatility.length >= MIN_BENCHMARK ? benchmark : null;
}

/**
 * The share of the market that does better than `value`, from 0 to 1.
 *
 * `higherIsWorse` for volatility and drawdown; Sharpe is the other way round.
 * Ties count as neither better nor worse, so a figure in the middle of a run
 * of equal ones sits in the middle.
 */
export function shareBetter(
  sorted: number[],
  value: number,
  higherIsWorse: boolean,
): number {
  if (sorted.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const above = sorted.length - below - equal;
  const better = higherIsWorse ? below : above;
  return (better + equal / 2) / sorted.length;
}

/** How far into the worse half of the market a figure is, as 0 to 100. */
const penalty = (shareBetterThanIt: number) =>
  Math.max(0, shareBetterThanIt - 0.5) * 200;

interface RiskReading {
  score: number | null;
  /** Figures in the market's worst quarter, for the reasons list. */
  flagged: { label: string; value: string; share: number }[];
}

/**
 * Risk as a score, which is never positive — measured against the market.
 *
 * Low volatility is not a reason to buy a company — it is the absence of a
 * reason not to — so this subtracts and never adds. Treating a placid share
 * as a buy signal is how a screen ends up recommending the securities that
 * do not trade.
 *
 * What it subtracts for is being worse than the rest of the exchange:
 * volatility and the deepest fall above the market's median, Sharpe below
 * it, each scaled from nothing at the median to the full amount at the very
 * worst, and averaged. It used to use fixed lines — sixty per cent
 * volatility, a beta of 1.3, a fifty per cent fall. Measured against 62
 * listings with three years of trading, the market's median volatility is
 * 68%, so the line sorted this exchange into "wild" and "exactly zero": a
 * calm company scored zero however poor its return for the risk taken, and
 * nothing between the two was told apart. Sharpe was not looked at at all.
 *
 * With no benchmark to hand (a market too thin to rank), the fixed lines are
 * still the fallback.
 */
function riskScore(risk: RiskMetrics, benchmark: RiskBenchmark | null): RiskReading {
  if (risk.volatility === null && risk.beta === null && risk.maxDrawdown === null) {
    return { score: null, flagged: [] };
  }

  if (!benchmark) {
    let score = 0;
    if (risk.volatility !== null && risk.volatility > HIGH_VOLATILITY) {
      score -= Math.min(40, (risk.volatility - HIGH_VOLATILITY) / 2);
    }
    if (risk.beta !== null && risk.beta > HIGH_BETA) {
      score -= Math.min(30, (risk.beta - HIGH_BETA) * 30);
    }
    if (risk.maxDrawdown !== null && risk.maxDrawdown > 50) {
      score -= Math.min(30, risk.maxDrawdown - 50);
    }
    return { score, flagged: [] };
  }

  const readings: { label: string; value: string; share: number }[] = [];
  if (risk.volatility !== null) {
    readings.push({
      label: "Хэлбэлзэл",
      value: `${risk.volatility.toFixed(1)}%`,
      share: shareBetter(benchmark.volatility, risk.volatility, true),
    });
  }
  if (risk.maxDrawdown !== null) {
    readings.push({
      label: "Хамгийн их уналт",
      value: `${risk.maxDrawdown.toFixed(1)}%`,
      share: shareBetter(benchmark.maxDrawdown, risk.maxDrawdown, true),
    });
  }
  if (risk.sharpe !== null) {
    readings.push({
      label: "Sharpe",
      value: risk.sharpe.toFixed(2),
      share: shareBetter(benchmark.sharpe, risk.sharpe, false),
    });
  }
  if (readings.length === 0) return { score: null, flagged: [] };

  const average =
    readings.reduce((sum, r) => sum + penalty(r.share), 0) / readings.length;
  return {
    // Never −0: a zero here is "nothing to brake with", and prints as one.
    score: average === 0 ? 0 : -average,
    flagged: readings.filter((r) => r.share >= 0.75),
  };
}

function describe(
  scorecard: Scorecard,
  ratios: RatioView[],
  risk: RiskMetrics,
  sectorLabel: string,
  peerCount: number,
  /** The market-relative flags, or null where fixed thresholds applied. */
  flagged: RiskReading["flagged"] | null,
): string[] {
  const reasons: string[] = [];

  const { buy, sell, neutral } = scorecard.counts;
  if (buy + sell + neutral > 0) {
    reasons.push(
      `Техник үзүүлэлт: ${buy} авах · ${sell} зарах · ${neutral} төвийг сахисан.`,
    );
  }

  // Named rather than counted: which ratio beats its sector is the thing a
  // reader wants, and "4 сайн" tells them nothing they can check.
  const strong = ratios.filter((r) => r.standing === "good").map((r) => r.label);
  const weak = ratios.filter((r) => r.standing === "poor").map((r) => r.label);
  if (peerCount > 0 && strong.length > 0) {
    reasons.push(
      `${sectorLabel} салбарын дунджаас давсан: ${strong.join(", ")}.`,
    );
  }
  if (peerCount > 0 && weak.length > 0) {
    reasons.push(`Салбарын дунджаас хоцорсон: ${weak.join(", ")}.`);
  }

  if (flagged) {
    for (const f of flagged) {
      reasons.push(
        `${f.label} ${f.value} — зах зээлийн ${Math.round(f.share * 100)}% нь үүнээс сайн.`,
      );
    }
  } else {
    if (risk.beta !== null && risk.beta > HIGH_BETA) {
      reasons.push(`Бета ${risk.beta.toFixed(2)} — зах зээлээс хүчтэй хэлбэлздэг.`);
    }
    if (risk.volatility !== null && risk.volatility > HIGH_VOLATILITY) {
      reasons.push(`Жилийн хэлбэлзэл ${risk.volatility.toFixed(0)}% — эрсдэл өндөр.`);
    }
    if (risk.maxDrawdown !== null && risk.maxDrawdown > 50) {
      reasons.push(
        `Сүүлийн жилүүдэд оргилоосоо ${risk.maxDrawdown.toFixed(0)}% хүртэл унаж байсан.`,
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push("Дүгнэлт гаргахад хангалттай өгөгдөл алга.");
  }
  return reasons;
}

export function combineSignal({
  scorecard,
  ratios,
  risk,
  sectorLabel,
  peerCount,
  benchmark = null,
}: {
  scorecard: Scorecard;
  ratios: RatioView[];
  risk: RiskMetrics;
  sectorLabel: string;
  peerCount: number;
  /** The market's risk figures to rank against; see `RiskBenchmark`. */
  benchmark?: RiskBenchmark | null;
}): CombinedSignal {
  const technical = technicalScore(scorecard);
  const fundamental = fundamentalScore(ratios);
  const riskReading = riskScore(risk, benchmark);
  const riskPenalty = riskReading.score;

  const parts: [number | null, number][] = [
    [fundamental, WEIGHTS.fundamental],
    [technical, WEIGHTS.technical],
    [riskPenalty, WEIGHTS.risk],
  ];

  // Renormalised over the parts that exist, so a company with no financial
  // report is scored on its chart rather than scored as though its
  // fundamentals were neutral.
  const present = parts.filter(([value]) => value !== null);
  const weightAvailable = present.reduce((sum, [, weight]) => sum + weight, 0);

  // Risk is a brake and only a brake. A company no riskier than the market's
  // median has nothing to brake with, and letting its zero take a fifth of
  // the weight pulled every such score a fifth of the way towards nothing —
  // 0.45 × 42 + 0.35 × 36 read as 32 rather than 39. So a zero is left out
  // of the score; it still counts as evidence for the confidence below.
  const riskPart = parts[2];
  const scored = riskPenalty === 0 ? present.filter((part) => part !== riskPart) : present;
  const scoredWeight = scored.reduce((sum, [, weight]) => sum + weight, 0);
  const score =
    scoredWeight === 0
      ? 0
      : scored.reduce((sum, [value, weight]) => sum + value! * weight, 0) /
        scoredWeight;

  const signal: Signal =
    score >= ACT_THRESHOLD ? "BUY" : score <= -ACT_THRESHOLD ? "SELL" : "HOLD";

  // Two things make a reading trustworthy: that there was evidence, and that
  // the evidence agreed. A single available part cannot agree with anything,
  // so it is capped well short of certainty.
  const coverage = weightAvailable;
  const directional = present
    .map(([value]) => value!)
    .filter((value) => Math.abs(value) > 1);
  const agreement =
    directional.length < 2
      ? 0.5
      : directional.every((v) => v > 0) || directional.every((v) => v < 0)
        ? 1
        : 0.35;
  const strength = Math.min(1, Math.abs(score) / 50);

  const confidence = Math.round(
    100 * coverage * (0.45 * agreement + 0.35 * strength + 0.2),
  );

  return {
    signal,
    score: Math.round(score),
    confidence: Math.max(0, Math.min(100, confidence)),
    parts: {
      technical: technical === null ? null : Math.round(technical),
      fundamental: fundamental === null ? null : Math.round(fundamental),
      risk: riskPenalty === null ? null : Math.round(riskPenalty),
    },
    reasons: describe(
      scorecard,
      ratios,
      risk,
      sectorLabel,
      peerCount,
      benchmark ? riskReading.flagged : null,
    ),
  };
}
