import { ulaanbaatarDateTime, ulaanbaatarDay } from "@/lib/day";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";
import type { CompanyNewsItem } from "@/lib/mse/news";
import type { NewsSourceExtract } from "@/lib/mse/newsSources";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * How much of the prompt the raw news extracts may take, in characters, and
 * how large the whole message may get.
 *
 * A per-source cap was the wrong shape: it bounded each extract but not how
 * many there were, so a reader with a dozen configured sites sent a
 * forty-thousand-token prompt. Groq's free tier allows twelve thousand
 * tokens a minute and refused every run with a 413; the paid providers took
 * it, and were being billed for a wall of front-page text nobody had asked
 * them to read.
 *
 * Mongolian in Cyrillic runs near two characters per token, so these are
 * roughly seven and a half thousand tokens of news inside a message of about
 * nine thousand — under the smallest ceiling any configured provider has.
 */
const EXTERNAL_BUDGET_CHARS = 6_000;
const MAX_MESSAGE_CHARS = 18_000;
/** Below this an extract is a headline fragment and not worth a slot. */
const MIN_EXTRACT_CHARS = 400;

export interface AnalystInput {
  security: Security;
  prices: PricePoint[];
  financials: Financials | null;
  recommendation: Recommendation;
  news: CompanyNewsItem[];
  externalNews?: NewsSourceExtract[];
}

export function buildUserMessage(input: AnalystInput): string {
  const { security, prices, financials, recommendation, news, externalNews } = input;
  const last = prices.at(-1) ?? null;
  const recent20Volume = average(prices.slice(-20).map((p) => p.volume));
  const dailyLimitUp = last ? last.close * 1.15 : null;
  const dailyLimitDown = last ? last.close * 0.85 : null;

  // How sparsely this security actually trades. MSE lists 400-odd companies
  // and about fifty change hands on a given day, so "the last 30 candles" can
  // span two years — a model reading them as consecutive days would call a
  // trend out of prices months apart.
  const today = ulaanbaatarDay(new Date());
  const daysSinceLastTrade = last
    ? Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
  const ninetyDaysAgo = ulaanbaatarDay(new Date(Date.now() - 90 * 86_400_000));
  const sessionsLast90Days = prices.filter((p) => p.date >= ninetyDaysAgo).length;

  const recentCandles = prices.slice(-30).map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));

  const payload = {
    now_ulaanbaatar: ulaanbaatarDateTime(new Date()),
    security: {
      symbol: security.symbol,
      name: security.name,
      classification: security.classification,
    },
    current_price: last?.close ?? null,
    daily_price_limit: {
      up: dailyLimitUp,
      down: dailyLimitDown,
      note: "MSE-д нэг өдөрт ханш өмнөх хаалтын үнээс ±15%-иас хэтэрч хэлбэлзэх боломжгүй.",
    },
    trading_activity: {
      last_trade_date: last?.date ?? null,
      days_since_last_trade: daysSinceLastTrade,
      sessions_in_last_90_calendar_days: sessionsLast90Days,
      candles_span_from: recentCandles[0]?.date ?? null,
      candles_span_to: recentCandles.at(-1)?.date ?? null,
      note: "Доорх лаанууд нь арилжаа болсон өдрүүд бөгөөд дараалсан өдрүүд БИШ байж болно. Огноог нь харгалзан үзэж, хоорондоо хол зайтай лаануудаас трэнд гаргахаас зайлсхий.",
    },
    technical_indicators: {
      sma20: recommendation.indicators.sma20,
      sma50: recommendation.indicators.sma50,
      rsi14: recommendation.indicators.rsi14,
      momentum20_pct: recommendation.indicators.momentum20,
      week52_high: recommendation.indicators.weekHigh52,
      week52_low: recommendation.indicators.weekLow52,
      price_position_in_52w_range_pct: recommendation.indicators.pricePositionInRange,
      avg_volume_last_20d: recent20Volume,
      last_volume: last?.volume ?? null,
    },
    rule_based_score: {
      signal: recommendation.signal,
      score: recommendation.score,
      technical_score: recommendation.technicalScore,
      fundamental_score: recommendation.fundamentalScore,
      reasons: recommendation.reasons,
    },
    fundamentals: financials
      ? {
          period: financials.period,
          pe: financials.pe,
          eps: financials.eps,
          roe: financials.roe,
          roa: financials.roa,
          net_profit: financials.netProfit,
          revenue: financials.revenue,
          shares_outstanding: financials.sharesOutstanding,
        }
      : null,
    recent_news_from_mse: news.map((n) => ({ title: n.title, date: n.date })),
    recent_daily_candles_oldest_to_newest: recentCandles,
  };

  const parts = [
    `Дараах МХБ-д бүртгэлтэй "${security.symbol}" (${security.name}) компанийн бодит арилжааны болон санхүүгийн дата өгөгдлийг дүн шинжилгээ хийж, зааврын дагуу зөвхөн JSON гаргана.`,
    "",
    "```json",
    // Unindented: a model reads the same object either way, and the two
    // spaces in front of every line of thirty candles are a third of this
    // block for nothing.
    JSON.stringify(payload),
    "```",
  ];

  const extracts = externalNews ? shareBudget(externalNews) : [];
  if (extracts.length > 0) {
    parts.push(
      "",
      `Хэрэглэгчийн тохируулсан мэдээний эх сурвалжуудаас татсан түүхий бичвэр (${security.symbol}-тэй холбоотой эсэхийг өөрөө үнэлж, зөвхөн хамааралтай хэсгийг сэтгэл хөдлөлийн шинжилгээнд ашигла):`,
    );
    for (const src of extracts) {
      parts.push("", `--- Эх сурвалж: ${src.url} ---`, src.text);
    }
  }

  const message = parts.join("\n");
  // A last guard rather than the main defence: the budget above is what keeps
  // the message small, and this only catches a payload that grew some other
  // way — an unusually long list of rule reasons, say.
  return message.length > MAX_MESSAGE_CHARS
    ? `${message.slice(0, MAX_MESSAGE_CHARS)}\n…(таслав)`
    : message;
}

/**
 * Divides the news budget between the sources that answered.
 *
 * An even split, so no single site can crowd out the rest, and sources past
 * the point where a share would be a fragment are dropped rather than
 * included as a sentence and a half.
 */
function shareBudget(sources: NewsSourceExtract[]): NewsSourceExtract[] {
  const affordable = Math.max(
    1,
    Math.min(sources.length, Math.floor(EXTERNAL_BUDGET_CHARS / MIN_EXTRACT_CHARS)),
  );
  const share = Math.floor(EXTERNAL_BUDGET_CHARS / affordable);
  return sources
    .slice(0, affordable)
    .map((src) => ({ url: src.url, text: src.text.slice(0, share) }));
}
