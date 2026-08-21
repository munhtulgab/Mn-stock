import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, type AnalystInput } from "./prompt";
import { estimateTokens } from "./tokens";
import type { StockAnalysis } from "@/lib/analysis/report";
import type { Reading, Scorecard } from "@/lib/analysis/indicators";

/**
 * What a provider with a small allowance is actually sent.
 *
 * Groq's free tier meters twelve thousand tokens a minute and refuses an
 * over-budget request whole, with a 413. The prompt builder used to stop
 * trimming above that line — it gave up the news, the candles and the
 * headlines and then declared the analysis untouchable — so the shortest
 * message it could build was still over, and that provider was refused on
 * every single request. Refusing to trim did not preserve the evidence; it
 * threw away the answer.
 *
 * So the sections come off in a stated order now, and the floor is the three
 * criteria a verdict has to rest on. These check that the order holds, that
 * the floor really is the floor, and that a model is never told how to read a
 * block it was not given.
 */

const OSC = ["RSI(14)", "MACD(12,26)", "Bollinger(20,2)", "ADX(14)", "Stochastic(14,3)", "ATR(14)", "OBV", "ROC(12)"];
const MAS = [5, 10, 20, 50, 100, 200].map((p) => `MA${p}`);
const VERDICTS = ["BUY", "NEUTRAL", "SELL"] as const;

function readings(labels: string[], seed: number, detail: boolean): Reading[] {
  return labels.map((label, i) => ({
    key: label.toLowerCase(),
    label,
    value: Math.round((100 + i * 37 + seed) * 100) / 100,
    ...(detail ? { detail: "+DI 24.1 / −DI 18.7" } : {}),
    verdict: VERDICTS[(i + seed) % 3],
  }));
}

function scorecard(timeframe: string, seed: number): Scorecard {
  return {
    timeframe,
    bars: 1200 - seed * 100,
    oscillators: readings(OSC, seed, true),
    movingAverages: readings(MAS, seed, false),
    counts: { buy: 6, sell: 3, neutral: 5 },
    summary: "BUY",
  } as Scorecard;
}

const RATIO_LABELS = ["P/E", "P/B", "EPS", "BVPS", "ROE", "ROA", "Цэвэр ашгийн маржин",
  "Нийт ашгийн маржин", "Өр / өөрийн хөрөнгө", "Урсгал харьцаа", "Мөнгөн харьцаа",
  "Хөрөнгийн эргэц", "Бараа материалын эргэц", "Авлагын эргэц", "EV/EBITDA"];

/** An АПУ-shaped analysis: every section populated, realistic in size. */
const analysis = {
  sector: "food",
  sectorLabel: "Хүнсний бүтээгдэхүүний үйлдвэрлэл",
  sectorStated: true,
  peerCount: 11,
  comparedToMarket: false,
  period: "2026-Q2",
  ratios: RATIO_LABELS.map((label, i) => ({
    key: `r${i}`, label, value: 12.34 + i, direction: "lower", digits: 2,
    sectorMedian: 9.87 + i, percentile: 40 + i * 3, standing: "above", yoy: -1.23 + i,
  })),
  scorecards: { "1D": scorecard("1D", 0), "1W": scorecard("1W", 1), "1M": scorecard("1M", 2) },
  risk: { overlap: 743, beta: 0.87, volatility: 34.21, sharpe: 0.44, sortino: 0.61,
    var95: 3.42, maxDrawdown: 41.2, annualReturn: 18.6 },
  riskYears: 3,
  profile: { companyCode: 90, symbol: "APU", high52w: 1070, low52w: 901.02, yearlyReturn: 12.4,
    yearlyStdDev: 28.9, avgVolume: 41234, yearVolume: 10012345, marketCap: 1.038e12,
    sharesOutstanding: 1064181553, freeFloatPct: 24.6, enterpriseValue: 1.12e12 },
  distribution: { companyCode: 90, sessions: 243, meanPct: 0.05, dailyStdDev: 1.82,
    annualStdDev: 28.9, minPct: -8.7, maxPct: 9.4, best1Sigma: 1.87, worst1Sigma: -1.77,
    histogram: Array.from({ length: 21 }, (_, i) => ({ bucket: -10 + i, count: 30 - Math.abs(10 - i) * 2 })) },
  combined: { signal: "BUY", score: 34, confidence: 62,
    parts: { technical: 40, fundamental: 28, risk: -5 },
    reasons: ["Гурван хугацааны индикатор давуугаар авах талд", "P/E салбарын медианаас доогуур",
      "ROE салбартаа 78-р хувьд", "Ногдол ашиг тав дараалан өссөн"] },
  dividends: Array.from({ length: 8 }, (_, i) => ({
    year: 2025 - i, amount: 130 - i * 12, yieldPct: 13.3 - i, payoutRatio: 40 + i,
    date: i === 0 ? "2026-04-20" : null, url: i === 0 ? "https://mse.mn/a/1" : null,
    source: i === 0 ? "mse" : "tdb" })),
  peers: ["APU", "SUU", "MMX", "TCK", "GOV", "BNG", "MIE", "ERS", "SUL", "BUK", "BDS", "MCH"]
    .map((symbol, i) => ({ symbol, name: "Компани", pe: 8 + i, pb: 1.1 + i / 10, roe: 15 + i, self: i === 0 })),
  candles: [],
  enoughHistory: true,
} as unknown as StockAnalysis;

const input: AnalystInput = {
  security: { symbol: "APU", name: "АПУ ХК", classification: "I" },
  prices: Array.from({ length: 400 }, (_, i) => ({
    companyCode: 90,
    date: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    open: 1000 + i, high: 1010 + i, low: 990 + i, close: 1000 + i, volume: 12345 + i,
  })),
  financials: { period: "2026-Q2", pe: 8.4, eps: 120, roe: 18, roa: 11,
    netProfit: 1.2e11, revenue: 8.4e11, sharesOutstanding: 1064181553 },
  recommendation: { signal: "BUY", score: 3, technicalScore: 2, fundamentalScore: 1,
    reasons: ["a", "b"],
    indicators: { sma20: 1000, sma50: 990, rsi14: 55, momentum20: 3.2,
      weekHigh52: 1070, weekLow52: 901, pricePositionInRange: 74 } },
  news: Array.from({ length: 20 }, (_, i) => ({
    title: `АПУ ХК-ийн ээлжит хурлын мэдэгдэл ${i}`, date: "2026-06-01" })),
  externalNews: [],
  analysis,
} as unknown as AnalystInput;

/** What one request costs the provider that meters the whole exchange. */
const COMPLETION_TOKENS = 1_500;
function cost(budget?: number): number {
  const prompt = buildPrompt({ ...input, budgetTokens: budget });
  return estimateTokens(prompt.system) + estimateTokens(prompt.user) + COMPLETION_TOKENS;
}

/** The order sections come off in, most expendable first. */
const GIVEN_UP_IN_ORDER = [
  "return_distribution",
  "sector_comparison",
  "year_profile",
  "dividend_history",
  "risk_metrics",
];

test("the two cards the page shows and the prompt never carried are in it", () => {
  // Жилийн үзүүлэлт and Өдрийн өгөөжийн тархалт were on the company page and
  // absent from every prompt built from it, so the model was arguing about a
  // company whose year and whose daily behaviour it had never been shown.
  const { user } = buildPrompt(input);
  assert.match(user, /"year_profile"/);
  assert.match(user, /"return_distribution"/);
  assert.match(user, /"free_float_pct"/);
  assert.match(user, /"typical_down_session_pct"/);
});

test("Groq's twelve thousand a minute is met, which it was not", () => {
  // Measured on the code this replaces: 5,388 of instructions plus a 5,844
  // floor for the message plus 1,500 for the answer is 12,732, against a
  // ceiling of 12,000. The message floor alone was already over the 5,000 it
  // was given, so the builder gave up and sent it anyway. Every request 413'd.
  assert.ok(cost(12_000) <= 12_000, `over budget at ${cost(12_000)}`);
});

test("a provider with room is trimmed for nobody", () => {
  const generous = buildPrompt({ ...input, budgetTokens: 30_000 });
  const unbounded = buildPrompt(input);
  assert.equal(generous.user, unbounded.user);
  for (const section of GIVEN_UP_IN_ORDER) {
    assert.match(generous.user, new RegExp(`"${section}"`), `${section} missing`);
  }
});

test("sections come off in the stated order, never out of it", () => {
  // Walked down rather than spot-checked: every budget from generous to
  // impossible, asserting that nothing has come off before the thing that is
  // meant to go first.
  let previouslyGone: string[] = [];
  for (let budget = 17_000; budget >= 11_000; budget -= 250) {
    const { user } = buildPrompt({ ...input, budgetTokens: budget });
    const gone = GIVEN_UP_IN_ORDER.filter((s) => !user.includes(`"${s}"`));
    assert.deepEqual(
      gone,
      GIVEN_UP_IN_ORDER.slice(0, gone.length),
      `at ${budget} the sections went out of order: ${gone.join(", ")}`,
    );
    assert.ok(
      gone.length >= previouslyGone.length,
      `at ${budget} a section came back after being cut`,
    );
    previouslyGone = gone;
  }
  assert.equal(previouslyGone.length, GIVEN_UP_IN_ORDER.length);
});

test("the floor is the three criteria a verdict rests on", () => {
  const { user, system } = buildPrompt({ ...input, budgetTokens: 1 });
  // Санхүүгийн үзүүлэлт, Техник шинжилгээ, Фундаментал шинжилгээ — and the
  // app's own verdict, which is what the model is asked to argue with.
  assert.match(user, /"fundamentals"/);
  assert.match(user, /"technical_analysis"/);
  assert.match(user, /"fundamental_analysis"/);
  assert.match(user, /"scored_components_minus100_to_100"/);
  // And the instructions still say how to answer, not only how to read.
  assert.match(system, /ГАРЦЫН ФОРМАТ/);
});

test("what was withheld is named, so it cannot be claimed as read", () => {
  const { user } = buildPrompt({ ...input, budgetTokens: 1 });
  assert.match(user, /илгээгээгүй/);
  for (const label of ["Эрсдэлийн үзүүлэлт", "Ногдол ашгийн түүх", "Жилийн үзүүлэлт",
    "Салбарын харьцуулалт", "Өдрийн өгөөжийн тархалт"]) {
    assert.ok(user.includes(label), `${label} not named as withheld`);
  }
});

test("the instructions explain the sections sent and no others", () => {
  const { system } = buildPrompt({ ...input, budgetTokens: 1 });
  assert.match(system, /technical_analysis\.scorecards/);
  assert.match(system, /fundamental_analysis\.ratios/);
  // Guidance for blocks this prompt does not carry is a fifth of a small
  // provider's whole allowance spent on the one thing it cannot use.
  assert.doesNotMatch(system, /return_distribution/);
  assert.doesNotMatch(system, /sector_comparison/);
  assert.doesNotMatch(system, /dividend_history/);
});

test("nothing withheld means no instructions about withholding", () => {
  // A model told to expect gaps when it has none starts hedging about
  // evidence it was handed in full.
  const { system } = buildPrompt(input);
  assert.doesNotMatch(system, /ХЭСЭГ ДУТУУ/);
  assert.match(buildPrompt({ ...input, budgetTokens: 1 }).system, /ХЭСЭГ ДУТУУ/);
});

test("the numbered guidance is numbered without gaps", () => {
  // Built from parts, so a prompt missing its fourth section must not hand
  // the model a list that jumps from three to five.
  const { system } = buildPrompt({ ...input, budgetTokens: 12_000 });
  const numbers = [...system.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  const guidance = numbers.filter((n, i) => n === 1 || numbers[i - 1] === n - 1);
  assert.deepEqual(guidance.slice(0, 5), [1, 2, 3, 4, 5]);
});

test("an analysis that could not be built still produces a prompt", () => {
  const { user, system } = buildPrompt({ ...input, analysis: null });
  assert.match(user, /"rule_based_score"/);
  assert.doesNotMatch(user, /илгээгээгүй/);
  assert.match(system, /ГАРЦЫН ФОРМАТ/);
});

test("every trimmed prompt is still valid JSON, at every budget", () => {
  // The reason the old builder gave for never trimming the analysis was that
  // a cut message is worse than a short one — "a JSON object with no closing
  // brace". True, and the answer is to compose each step whole and measure
  // it, not to refuse to compose short ones. This walks every step and parses
  // what a model would actually receive.
  for (let budget = 20_000; budget >= 1_000; budget -= 500) {
    const { user } = buildPrompt({ ...input, budgetTokens: budget });
    const block = /```json\n([\s\S]*?)\n```/.exec(user);
    assert.ok(block, `no JSON block at budget ${budget}`);
    const parsed = JSON.parse(block[1]) as Record<string, unknown>;
    // And the three that must survive are objects, not empty husks.
    assert.ok(parsed.technical_analysis, `technical gone at ${budget}`);
    assert.ok(parsed.fundamental_analysis, `fundamental gone at ${budget}`);
    assert.ok(parsed.fundamentals, `financials gone at ${budget}`);
  }
});

test("no model is shown the verdict it is being asked for", () => {
  // The reported symptom: Gemini, Groq, OpenRouter, Cerebras and Cloudflare
  // all answered BUY at exactly 83%. Five model families do not land on the
  // same integer by thinking; they land on it by being told it. The prompt
  // carried `combined_verdict_from_this_app` — this app's signal, score and
  // confidence — under a note calling it the final verdict and asking each
  // model to say whether it agreed. The agreement figure printed beside them
  // was then measuring obedience.
  //
  // Checked at every budget, because the block only has to survive one rung
  // of the ladder to poison the panel.
  for (let budget = 20_000; budget >= 1_000; budget -= 500) {
    const { user, system } = buildPrompt({ ...input, budgetTokens: budget });
    const payload = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(user)![1]);

    assert.equal(payload.combined_verdict_from_this_app, undefined,
      `the app's verdict is back in the prompt at budget ${budget}`);

    // Nor smuggled in under another name: the app's own signal and its
    // confidence must not appear anywhere in the message.
    const flat = JSON.stringify(payload);
    assert.doesNotMatch(flat, /"confidence"/, `a confidence at budget ${budget}`);
    assert.doesNotMatch(flat, /"signal"/, `a signal at budget ${budget}`);

    // And the instructions must not ask the model to react to a verdict.
    assert.doesNotMatch(system, /эцсийн дүгнэлт\. Үүнтэй санал/);
  }
});

test("the component scores are sent as workings, not as an answer", () => {
  // They are still worth sending — a model that disagrees with the technical
  // score should say so — but they are labelled as intermediate and carry no
  // signal and no confidence to copy.
  const { user } = buildPrompt(input);
  const payload = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(user)![1]);
  const scored = payload.scored_components_minus100_to_100;
  assert.ok(scored, "component scores missing");
  assert.equal(scored.technical, 40);
  assert.equal(scored.fundamental, 28);
  assert.equal(scored.risk_penalty, -5);
  assert.match(scored.note, /Дүгнэлт БИШ/);
  assert.equal(scored.signal, undefined);
  assert.equal(scored.confidence, undefined);
});

test("the confidence rule tells the model what the number has to mean", () => {
  // A model asked for a confidence and given no scale returns a habit — 80,
  // 85, 90. It is asked here for a measure of how well the evidence holds,
  // with the three things it is made of named.
  const { system } = buildPrompt({ ...input, budgetTokens: 1 });
  assert.match(system, /signal_confidence[\s\S]*тогтоох журам/);
  assert.match(system, /НОТОЛГООНЫ ХЭМЖЭЭ/);
  assert.match(system, /НОТОЛГООНЫ НИЙЦЭЛ/);
  assert.match(system, /ДОХИОНЫ ХҮЧ/);
});
