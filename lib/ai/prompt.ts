import { ulaanbaatarDateTime, ulaanbaatarDay } from "@/lib/day";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";
import type { CompanyNewsItem } from "@/lib/mse/news";
import type { NewsSourceExtract } from "@/lib/mse/newsSources";
import type { StockAnalysis } from "@/lib/analysis/report";
import type { Reading, Scorecard } from "@/lib/analysis/indicators";
import type { Timeframe } from "@/lib/analysis/series";

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
 * Mongolian in Cyrillic runs near two characters per token, so the message
 * has to stay under the smallest ceiling any configured provider has —
 * Groq's free tier, at twelve thousand tokens a minute.
 *
 * The news share was halved when the worked analysis moved into the prompt.
 * Three scorecards, the ratios against the sector, the dividends, the risk
 * figures and the peer table cost about six thousand characters, and they
 * are worth more per character than a fifth page of somebody's front page:
 * they are measured from this company's whole history and from every other
 * company's last report, where the extracts are raw text the model still has
 * to decide is even about this company. Worst case is now around ten
 * thousand tokens all told, system prompt included.
 */
const EXTERNAL_BUDGET_CHARS = 3_000;
const MAX_MESSAGE_CHARS = 18_000;
/** Below this an extract is a headline fragment and not worth a slot. */
const MIN_EXTRACT_CHARS = 400;
/**
 * Peers listed in the sector comparison.
 *
 * The ranking is computed over every reporting company in the sector and the
 * percentiles already carry that whole population; the table is here so the
 * model can name a comparable, and a dozen is enough to do that.
 */
const MAX_PEERS = 12;

export interface AnalystInput {
  security: Security;
  prices: PricePoint[];
  financials: Financials | null;
  recommendation: Recommendation;
  news: CompanyNewsItem[];
  externalNews?: NewsSourceExtract[];
  /**
   * Everything the company's page shows below the price: the three technical
   * scorecards, the ratios against the sector, the dividend history, the
   * risk figures, the peer table and the app's own combined verdict.
   *
   * Optional because a run must still produce an answer when the analysis
   * cannot be built — it reads the whole market to rank one company, and
   * that can fail on its own.
   */
  analysis?: StockAnalysis | null;
}

/**
 * A scorecard's readings as "label: value · detail · verdict".
 *
 * Written as strings rather than objects because there are up to fourteen of
 * them at each of three intervals: as objects the same information costs
 * three times the characters, and the budget below is what keeps the message
 * inside the smallest provider's per-minute ceiling.
 */
function readings(list: Reading[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const reading of list) {
    // A reading with no figure and no verdict is an indicator this security
    // has too little history for. Saying so fourteen times over teaches the
    // model nothing; leaving it out is the same information, shorter.
    if (reading.value === null && !reading.verdict) continue;
    out[reading.label] = [
      reading.value === null ? "—" : String(reading.value),
      reading.detail,
      reading.verdict,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return out;
}

function scorecardPayload(scorecard: Scorecard) {
  return {
    bars: scorecard.bars,
    summary: scorecard.summary,
    counts: scorecard.counts,
    oscillators: readings(scorecard.oscillators),
    moving_averages: readings(scorecard.movingAverages),
  };
}

const INTERVAL_NOTE: Record<Timeframe, string> = {
  "1D": "өдрийн лаагаар",
  "1W": "долоо хоногийн лаагаар",
  "1M": "сарын лаагаар",
};

/**
 * The page's own analysis, laid out for the model.
 *
 * These are the same figures a reader sees on the company's page — computed
 * on the server from the full price history and from every other company's
 * last report. Handing them over means the model argues with a worked
 * analysis rather than re-deriving a worse one from thirty candles.
 */
function analysisPayload(analysis: StockAnalysis) {
  const scorecards: Record<string, unknown> = {};
  for (const [timeframe, scorecard] of Object.entries(analysis.scorecards)) {
    scorecards[`${timeframe} (${INTERVAL_NOTE[timeframe as Timeframe]})`] =
      scorecardPayload(scorecard);
  }

  return {
    technical_analysis: {
      note: "Индикатор бүрийн ард гарсан BUY/NEUTRAL/SELL бол уг үзүүлэлтийн дүгнэлт. Эдгээрийг бүрэн ашигла — доорх 30 лаанаас дахин тооцоолох шаардлагагүй.",
      scorecards,
    },
    fundamental_analysis: {
      period: analysis.period,
      compared_against: analysis.comparedToMarket
        ? "Салбартаа хангалттай компани байхгүй тул зах зээлийн бүх компанитай харьцуулсан"
        : `${analysis.sectorLabel} салбарын ${analysis.peerCount} компанитай харьцуулсан`,
      note: "percentile нь салбартаа хэддүгээр хувьд байгаа нь (100 = хамгийн сайн). standing нь салбарын медиантай харьцуулсан байдал. yoy нь өмнөх оны мөн үетэй харьцуулсан өөрчлөлт.",
      ratios: analysis.ratios.map((ratio) => ({
        label: ratio.label,
        value: ratio.value,
        sector_median: ratio.sectorMedian,
        percentile: ratio.percentile,
        standing: ratio.standing,
        yoy: ratio.yoy,
        // Marked because it is a closed year from Datalab rather than the
        // exchange's running quarter, and the two are not the same date.
        ...(ratio.external ? { source: "TDB Datalab, сүүлийн хаагдсан жил" } : {}),
      })),
    },
    dividend_history: analysis.dividends.map((dividend) => ({
      year: dividend.year,
      amount_per_share: dividend.amount,
      yield_pct: dividend.yieldPct,
      payout_ratio_pct: dividend.payoutRatio,
      announced: dividend.date,
    })),
    risk_metrics: {
      window_years: analysis.riskYears,
      sessions_measured: analysis.risk.overlap,
      beta_vs_top20: analysis.risk.beta,
      annualised_volatility_pct: analysis.risk.volatility,
      sharpe: analysis.risk.sharpe,
      sortino: analysis.risk.sortino,
      var95_daily_loss_pct: analysis.risk.var95,
      max_drawdown_pct: analysis.risk.maxDrawdown,
      annualised_return_pct: analysis.risk.annualReturn,
    },
    sector_comparison: {
      sector: analysis.sectorLabel,
      // A guessed sector and a published one are not the same evidence, and
      // a percentile against the wrong peer group is worse than none.
      sector_is_stated: analysis.sectorStated,
      peer_count: analysis.peerCount,
      peers: analysis.peers.slice(0, MAX_PEERS).map((peer) => ({
        symbol: peer.symbol,
        pe: peer.pe,
        pb: peer.pb,
        roe: peer.roe,
        ...(peer.self ? { this_company: true } : {}),
      })),
    },
    combined_verdict_from_this_app: {
      note: "Энэ бол манай системийн эцсийн дүгнэлт. Үүнтэй санал нийлж эсвэл нийлэхгүй байгаагаа тайлбартаа тодорхой хэл.",
      signal: analysis.combined.signal,
      score_minus100_to_100: analysis.combined.score,
      confidence: analysis.combined.confidence,
      parts: analysis.combined.parts,
      reasons: analysis.combined.reasons,
    },
  };
}

export function buildUserMessage(input: AnalystInput): string {
  const { security, prices, financials, recommendation, news, externalNews, analysis } =
    input;
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
    // The worked analysis, where it could be built. Spread in above the news
    // and the candles so the finished figures are read before the raw ones.
    ...(analysis ? analysisPayload(analysis) : {}),
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
