import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRiskBenchmark, combineSignal, shareBetter, type RiskBenchmark } from "./signal";
import type { RiskMetrics } from "./risk";
import type { Scorecard } from "./indicators";
import type { RatioView } from "./fundamentals";

const risk = (volatility: number, maxDrawdown: number, sharpe: number): RiskMetrics => ({
  overlap: 300, beta: 0.3, volatility, sharpe, sortino: null, var95: null, maxDrawdown, annualReturn: null,
});

/** A market of 40 companies spread evenly: volatility 10–49, drawdown 5–44, Sharpe −2.0 to 1.9. */
const market: RiskBenchmark = buildRiskBenchmark(
  Array.from({ length: 40 }, (_, i) => risk(10 + i, 5 + i, -2 + i / 10)),
)!;

const noScorecard = { counts: { buy: 0, sell: 0, neutral: 0 } } as unknown as Scorecard;
const verdict = (r: RiskMetrics, benchmark: RiskBenchmark | null = market, ratios: RatioView[] = []) =>
  combineSignal({ scorecard: noScorecard, ratios, risk: r, sectorLabel: "x", peerCount: 0, benchmark });

test("the benchmark needs enough of a market to rank against", () => {
  assert.equal(buildRiskBenchmark(Array.from({ length: 5 }, () => risk(20, 10, 0))), null);
  assert.equal(market.volatility.length, 40);
  assert.deepEqual(market.volatility.slice(0, 3), [10, 11, 12]);
});

test("the share of the market doing better", () => {
  assert.equal(shareBetter([1, 2, 3, 4], 5, true), 1);    // worst
  assert.equal(shareBetter([1, 2, 3, 4], 0, true), 0);    // best
  assert.equal(shareBetter([1, 2, 3, 4], 0, false), 1);   // lowest Sharpe is worst
  assert.equal(shareBetter([2, 2, 2, 2], 2, true), 0.5);  // ties sit in the middle
});

test("no riskier than the market's median: zero", () => {
  assert.equal(verdict(risk(14.9, 20, 1.5)).parts.risk, 0);
});

test("a little past the median is a little penalty, not a cliff", () => {
  // Drawdown 25.5 against a median of 24.5 in this fixture.
  const r = verdict(risk(14.9, 25.5, 1.5)).parts.risk!;
  assert.ok(r < 0 && r > -5, String(r));
});

test("worse than most of the market: a real penalty, where the old lines gave none", () => {
  // 45% volatility, 40% fall, Sharpe −1.8 — none crosses 60% / 50%.
  const r = verdict(risk(45, 40, -1.8)).parts.risk!;
  assert.ok(r < -60, `expected a heavy penalty, got ${r}`);
  assert.equal(verdict(risk(45, 40, -1.8), null).parts.risk, 0, "fixed lines gave nothing");
});

test("the very worst on every count scores close to −100", () => {
  assert.ok(verdict(risk(99, 99, -9)).parts.risk! <= -97);
});

test("risk is never positive, however calm", () => {
  assert.equal(verdict(risk(1, 1, 9)).parts.risk, 0);
});

test("a zero risk part does not drag the score towards nothing", () => {
  const ratios = [{ percentile: 71, standing: "good", label: "ROE" }] as unknown as RatioView[];
  // Fundamentals alone score (71 − 50) × 2 = 42.
  assert.equal(verdict(risk(14, 10, 1.5), market, ratios).score, 42);
});

test("a penalty does pull the score down", () => {
  const ratios = [{ percentile: 71, standing: "good", label: "ROE" }] as unknown as RatioView[];
  assert.ok(verdict(risk(45, 40, -1.8), market, ratios).score < 42);
});

test("a figure in the market's worst quarter is named in the reasons", () => {
  const reasons = verdict(risk(47, 20, 1.5)).reasons.join(" ");
  assert.match(reasons, /Хэлбэлзэл 47\.0% — зах зээлийн \d+% нь үүнээс сайн/);
  assert.doesNotMatch(reasons, /Хамгийн их уналт/);
});
