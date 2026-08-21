import { ulaanbaatarDateTime, ulaanbaatarDay } from "@/lib/day";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";
import type { CompanyNewsItem } from "@/lib/mse/news";
import type { NewsSourceExtract } from "@/lib/mse/newsSources";
import type { StockAnalysis } from "@/lib/analysis/report";
import type { Reading, Scorecard } from "@/lib/analysis/indicators";
import type { Timeframe } from "@/lib/analysis/series";
import type { TdbProfile, TdbReturnDistribution } from "@/lib/tdb/datalab";
import { estimateTokens } from "@/lib/ai/tokens";
import { systemPromptFor } from "@/lib/ai/systemPrompt";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * What one request may cost, in tokens, for a provider that has not said.
 *
 * Generous, because most providers' ceilings are far above anything this
 * builds. The small ones say so — see PROVIDER_TOKEN_BUDGET.
 */
const DEFAULT_BUDGET_TOKENS = 30_000;

/**
 * Room left for the answer.
 *
 * Counted against the same ceiling as the question, because the providers
 * that impose one meter the whole exchange: Groq's free tier allows twelve
 * thousand tokens a minute and a request whose reply would take it past that
 * is refused whole, not truncated.
 */
const COMPLETION_TOKENS = 1_500;

/**
 * The two halves of one request.
 *
 * Kept together because they are trimmed together — the instructions explain
 * the sections, so a message that drops a section must drop its explanation
 * too, and neither can be measured without the other.
 */
export interface AnalystPrompt {
  system: string;
  user: string;
}

/**
 * The guidance that stands whatever else is cut.
 *
 * The two core criteria the model reads from the analysis, this app's own
 * verdict for it to agree or disagree with, and the two rules about what to
 * write — the news sentiment and the stop/target arithmetic — which describe
 * the answer rather than the evidence and so apply however little evidence
 * there was.
 */
const CORE_GUIDED_SECTIONS = [
  "technical",
  "fundamental",
  "combined",
  "news",
  "risk_reward",
] as const;

/**
 * What is given up first when a budget will not stretch.
 *
 * The order is the point. Three things go before the analysis is touched at
 * all, because each is either raw material the analysis has already read or a
 * duplicate of something in it:
 *
 *   1. the configured news sites' extracts, which are pages of front-page
 *      text the model must first decide are even about this company;
 *   2. the thirty raw candles, which the scorecards were computed from and
 *      which say less than the scorecards do;
 *   3. the exchange's own headlines, down to the most recent few.
 *
 * Below that the analysis itself is thinned, section by section, which it did
 * not used to be — and the floor was 5,844 tokens against Groq's 5,000, so
 * that provider was refused with a 413 on every single request rather than
 * answering from less. Refusing to trim did not keep the evidence intact; it
 * threw away the whole answer.
 *
 * So the sections now come off in the order below, and what is left standing
 * at the bottom is the three the reader named as the ones a verdict has to
 * rest on: the quarter's filing, the technical scorecards, and the
 * fundamental ratios against the sector — plus this app's own combined
 * verdict, which costs almost nothing and is the thing the model is asked to
 * agree or disagree with. Whatever has been withheld is named in the message,
 * so a model cannot claim to have weighed a section it never saw.
 */
const SECTIONS_BY_VALUE = [
  // Kept longest of the optional five: it is what stop_loss and risk_level
  // are supposed to be set from, and nothing else in the message carries it.
  "risk_metrics",
  // A year-by-year record the model cannot infer from a quarter.
  "dividend_history",
  // The year's range and float. Useful, but 52-week high and low also reach
  // the model through technical_indicators, so some of this survives its
  // removal.
  "year_profile",
  // The percentiles in fundamental_analysis already carry the whole sector
  // population; this table only lets the model name a comparable.
  "sector_comparison",
  // First to go. Twenty-one histogram buckets is the densest block in the
  // message, and annualised volatility in risk_metrics says most of what it
  // says in one number.
  "return_distribution",
] as const;

type SectionName = (typeof SECTIONS_BY_VALUE)[number];

/** What the model is told it did not get, in the language of the page. */
const SECTION_LABEL: Record<SectionName, string> = {
  risk_metrics: "Эрсдэлийн үзүүлэлт",
  dividend_history: "Ногдол ашгийн түүх",
  year_profile: "Жилийн үзүүлэлт",
  sector_comparison: "Салбарын харьцуулалт",
  return_distribution: "Өдрийн өгөөжийн тархалт",
};
/** Below this an extract is a headline fragment and not worth a slot. */
const MIN_EXTRACT_CHARS = 400;
/** Headlines kept when the exchange's own news has to give ground. */
const MIN_HEADLINES = 4;
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
  /**
   * What the whole request — instructions, message and the answer it leaves
   * room for — may cost the provider it is going to. Left unset for the
   * providers whose ceilings are far above anything built here.
   */
  budgetTokens?: number;
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
 * The year at a glance, as Datalab states it.
 *
 * Stated rather than computed, which is the reason it is worth sending: a
 * 52-week high worked out from the candles this app holds is only as complete
 * as those candles, and on an exchange where a listing can go a fortnight
 * without a trade that is a real difference. The free float is here for the
 * same reason liquidity_risk exists — a company whose shares are 95% held by
 * its founders cannot be bought in size at the quoted price.
 */
function yearProfilePayload(profile: TdbProfile) {
  return {
    note: "TDB Datalab-ын өөрийнх нь мэдээлсэн тоо. Энэ апп-ын лаанаас тооцоолсон биш.",
    week52_high: profile.high52w,
    week52_low: profile.low52w,
    yearly_return_pct: profile.yearlyReturn,
    yearly_stddev_pct: profile.yearlyStdDev,
    avg_session_volume: profile.avgVolume,
    year_volume: profile.yearVolume,
    market_cap: profile.marketCap,
    shares_outstanding: profile.sharesOutstanding,
    free_float_pct: profile.freeFloatPct,
  };
}

/**
 * What a single session in this share has actually looked like.
 *
 * A year's daily returns as a histogram, plus the shape figures around it.
 * Annualised volatility says one number about that shape; this says whether
 * the number came from a fat tail or an even spread, which is the difference
 * between a stop loss that survives an ordinary week and one that does not.
 */
function distributionPayload(distribution: TdbReturnDistribution) {
  return {
    note: "Сүүлийн жилийн өдрийн өгөөжийн тархалт. bucket нь өгөөжийн хувь, count нь тэр мужид хэдэн өдөр таарсан.",
    sessions: distribution.sessions,
    mean_pct: distribution.meanPct,
    daily_stddev_pct: distribution.dailyStdDev,
    annual_stddev_pct: distribution.annualStdDev,
    worst_session_pct: distribution.minPct,
    best_session_pct: distribution.maxPct,
    typical_up_session_pct: distribution.best1Sigma,
    typical_down_session_pct: distribution.worst1Sigma,
    histogram: distribution.histogram.map((bucket) => [bucket.bucket, bucket.count]),
  };
}

/**
 * The page's own analysis, laid out for the model.
 *
 * These are the same figures a reader sees on the company's page — computed
 * on the server from the full price history and from every other company's
 * last report. Handing them over means the model argues with a worked
 * analysis rather than re-deriving a worse one from thirty candles.
 */
function analysisPayload(analysis: StockAnalysis, keep: Set<SectionName>) {
  const scorecards: Record<string, unknown> = {};
  for (const [timeframe, scorecard] of Object.entries(analysis.scorecards)) {
    scorecards[`${timeframe} (${INTERVAL_NOTE[timeframe as Timeframe]})`] =
      scorecardPayload(scorecard);
  }

  // Each optional section is present or absent whole. A half-sent risk block
  // is worse than none: the model would set a stop loss from whichever
  // figures happened to survive.
  const optional = {
    ...(keep.has("dividend_history")
      ? {
          dividend_history: analysis.dividends.map((dividend) => ({
            year: dividend.year,
            amount_per_share: dividend.amount,
            yield_pct: dividend.yieldPct,
            payout_ratio_pct: dividend.payoutRatio,
            announced: dividend.date,
          })),
        }
      : {}),
    ...(keep.has("risk_metrics")
      ? {
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
        }
      : {}),
    ...(keep.has("year_profile") && analysis.profile
      ? { year_profile: yearProfilePayload(analysis.profile) }
      : {}),
    ...(keep.has("return_distribution") && analysis.distribution
      ? { return_distribution: distributionPayload(analysis.distribution) }
      : {}),
    ...(keep.has("sector_comparison")
      ? {
          sector_comparison: {
            sector: analysis.sectorLabel,
            // A guessed sector and a published one are not the same evidence,
            // and a percentile against the wrong peer group is worse than none.
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
        }
      : {}),
  };

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
    ...optional,
    // The app's own verdict used to be here — its signal, its score, its
    // confidence — under a note calling it "манай системийн эцсийн дүгнэлт"
    // and asking the model to say whether it agreed.
    //
    // It agreed. All five providers came back BUY at exactly 83%, which is
    // not five analysts concurring but one number copied five times: the
    // panel exists to give the reader independent reads, and a model shown
    // the answer and asked to react to it is not an independent read. Worse,
    // the agreement figure printed beside them — "5/5, тохиролцоо 100%" — was
    // then measuring how obediently they copied.
    //
    // What is left is the evidence the verdict was computed from, which the
    // sections above already carry in full. The comparison is still made and
    // still shown; it is made by this app afterwards, against answers reached
    // without knowing what it wanted to hear.
    ...(analysis.combined.parts.technical === null &&
    analysis.combined.parts.fundamental === null
      ? {}
      : {
          scored_components_minus100_to_100: {
            note: "Энэ апп-ын онооны задаргаа. Дүгнэлт БИШ — дээрх үзүүлэлтүүдээс тооцсон завсрын оноо. Өөрийн дүгнэлтээ эдгээрээс бус, анхдагч үзүүлэлтүүдээс гарга.",
            technical: analysis.combined.parts.technical,
            fundamental: analysis.combined.parts.fundamental,
            risk_penalty: analysis.combined.parts.risk,
          },
        }),
  };
}

export function buildPrompt(input: AnalystInput): AnalystPrompt {
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
    // Only where the worked analysis is missing. The two are different
    // engines and they disagree — that disagreement is the bug this app was
    // just fixed for, and printing both would hand the model two verdicts
    // and no way to choose. The combined verdict below is the app's opinion;
    // this older six-indicator score stands in only when there isn't one.
    ...(analysis
      ? {}
      : {
          rule_based_score: {
            signal: recommendation.signal,
            score: recommendation.score,
            technical_score: recommendation.technicalScore,
            fundamental_score: recommendation.fundamentalScore,
            reasons: recommendation.reasons,
          },
        }),
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
  };

  const budget = input.budgetTokens ?? DEFAULT_BUDGET_TOKENS;

  // Assembled largest-first and measured each time, rather than built whole
  // and cut to length. Slicing a finished message in half leaves the model a
  // JSON object with no closing brace, which is worse than the same message
  // without its last section.
  const compose = (
    headlines: number,
    candles: number,
    extractChars: number,
    sections: number,
  ): AnalystPrompt => {
    const keep = new Set(SECTIONS_BY_VALUE.slice(0, sections));
    const dropped = SECTIONS_BY_VALUE.slice(sections);

    const parts = [
      `Дараах МХБ-д бүртгэлтэй "${security.symbol}" (${security.name}) компанийн бодит арилжааны болон санхүүгийн дата өгөгдлийг дүн шинжилгээ хийж, зааврын дагуу зөвхөн JSON гаргана.`,
      "",
      "```json",
      // Unindented: a model reads the same object either way, and the two
      // spaces in front of every line of thirty candles are a third of this
      // block for nothing.
      JSON.stringify({
        ...payload,
        // The worked analysis, where it could be built. After the raw figures
        // above so the finished ones are read last and stay nearest the
        // question, and thinned to whatever this step can afford.
        ...(analysis ? analysisPayload(analysis, keep) : {}),
        recent_news_from_mse: news
          .slice(0, headlines)
          .map((n) => ({ title: n.title, date: n.date })),
        ...(candles > 0
          ? { recent_daily_candles_oldest_to_newest: recentCandles.slice(-candles) }
          : {}),
      }),
      "```",
    ];

    // Named rather than silently missing. A model given no risk block will
    // otherwise set a stop loss as though it had one, and say in its reasons
    // that it weighed the volatility.
    if (analysis && dropped.length > 0) {
      parts.push(
        "",
        `Токены хязгаараас болж дараах хэсгийг илгээгээгүй: ${dropped
          .map((section) => SECTION_LABEL[section])
          .join(", ")}. Эдгээрийг үзсэн мэтээр бичихгүй, дүгнэлтээ Санхүүгийн үзүүлэлт, Техник шинжилгээ, Фундаментал шинжилгээ гурав дээр тулгуурлаж гаргана. Илгээгээгүй хэсэгт хамаарах тоо шаардлагатай бол (жишээ нь stop_loss) байгаа өгөгдлөөс болгоомжтой тооцож, итгэлцлээ тохируулна.`,
      );
    }

    const extracts = shareBudget(externalNews ?? [], extractChars);
    if (extracts.length > 0) {
      parts.push(
        "",
        `Хэрэглэгчийн тохируулсан мэдээний эх сурвалжуудаас татсан түүхий бичвэр (${security.symbol}-тэй холбоотой эсэхийг өөрөө үнэлж, зөвхөн хамааралтай хэсгийг сэтгэл хөдлөлийн шинжилгээнд ашигла):`,
      );
      for (const src of extracts) {
        parts.push("", `--- Эх сурвалж: ${src.url} ---`, src.text);
      }
    }

    // The instructions carry exactly the sections the message does, in the
    // order they appear in it. Explaining a block that was cut is a fifth of
    // a small provider's allowance spent on the one thing it cannot use.
    return {
      system: systemPromptFor(
        [
          ...CORE_GUIDED_SECTIONS.slice(0, 2),
          ...SECTIONS_BY_VALUE.filter((section) => keep.has(section)),
          ...CORE_GUIDED_SECTIONS.slice(2),
        ],
        { withheld: Boolean(analysis) && dropped.length > 0 },
      ),
      user: parts.join("\n"),
    };
  };

  // Each step gives up the next thing on the list at the top of this file:
  // the news extracts, then the raw candles, then the headlines, and only
  // then the analysis section by section. The last step is the three criteria
  // a verdict has to rest on and nothing else.
  const all = SECTIONS_BY_VALUE.length;
  const steps: [number, number, number, number][] = [
    [news.length, 30, 6_000, all],
    [news.length, 30, 3_000, all],
    [news.length, 30, 0, all],
    [news.length, 15, 0, all],
    [news.length, 0, 0, all],
    [MIN_HEADLINES, 0, 0, all],
    [MIN_HEADLINES, 0, 0, all - 1],
    [MIN_HEADLINES, 0, 0, all - 2],
    [MIN_HEADLINES, 0, 0, all - 3],
    [MIN_HEADLINES, 0, 0, all - 4],
    [MIN_HEADLINES, 0, 0, 0],
  ];

  let prompt = compose(...steps[0]);
  for (const step of steps) {
    prompt = compose(...step);
    const cost =
      estimateTokens(prompt.system) + estimateTokens(prompt.user) + COMPLETION_TOKENS;
    if (cost <= budget) return prompt;
  }
  // Nothing left to give up without giving up the question itself. Sent as it
  // is: a provider whose ceiling is below the three core criteria fails
  // loudly rather than silently answering from half a prompt.
  return prompt;
}

/**
 * Divides the news budget between the sources that answered.
 *
 * An even split, so no single site can crowd out the rest, and sources past
 * the point where a share would be a fragment are dropped rather than
 * included as a sentence and a half.
 */
function shareBudget(
  sources: NewsSourceExtract[],
  budgetChars: number,
): NewsSourceExtract[] {
  if (budgetChars < MIN_EXTRACT_CHARS || sources.length === 0) return [];
  const affordable = Math.max(
    1,
    Math.min(sources.length, Math.floor(budgetChars / MIN_EXTRACT_CHARS)),
  );
  const share = Math.floor(budgetChars / affordable);
  return sources
    .slice(0, affordable)
    .map((src) => ({ url: src.url, text: src.text.slice(0, share) }));
}
