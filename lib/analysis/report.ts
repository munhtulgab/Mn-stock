import type { Db } from "mongodb";
import type { Financials, PricePoint, Security } from "@/lib/types";
import { fetchIndexSeries } from "@/lib/mse/indices";
import { getDividendHistory, type Dividend } from "@/lib/dividends";
import { classifySector, resolveSector, type SectorKey } from "./sectors";
import { getTdbLatest, getTdbProfile } from "@/lib/tdb/store";
import type { TdbProfile, TdbReturnDistribution } from "@/lib/tdb/datalab";
import type { TdbYear } from "@/lib/tdb/datalab";
import {
  buildRatioViews,
  computeRatios,
  isBlankReport,
  type RatioInputs,
  type RatioView,
  type YearOnYear,
  type SectorPeer,
} from "./fundamentals";
import { buildScorecard, type Scorecard } from "./indicators";
import { computeRisk, RISK_YEARS, type RiskMetrics } from "./risk";
import { buildGoldBasis, type GoldBasis } from "./goldBasis";
import { getGoldPrices, tracksGold } from "@/lib/gold";
import { combineSignal, type CombinedSignal } from "./signal";
import { TIMEFRAMES, type Candle, type Timeframe } from "./series";
import { withLiveCandle } from "@/lib/liveCandle";
import type { LiveQuote } from "@/lib/marketinfo/quotes";

/**
 * The whole analysis for one company, assembled once on the server.
 *
 * Everything here is derived rather than stored: the scorecards from the
 * price history, the ratios from the last report, the peer ranking from
 * every other company in the same sector. It is done in one place so the
 * page renders a finished object and the client ships no arithmetic — and
 * so the three scorecards are computed from the same candles rather than
 * three components each fetching their own.
 */

/** Sessions of history below which a scorecard is not worth drawing. */
const MIN_CANDLES = 30;
/** Peers needed before a sector median means anything. */
const MIN_PEERS = 3;
/** Years of daily candles read for the chart and the long averages. */
const HISTORY_YEARS = 12;

export interface PeerRow {
  symbol: string;
  name: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  /** True for the company whose page this is. */
  self: boolean;
}

/** One year's payout, and the announcement it was read from. */
export interface DividendRow {
  /** The year whose profit was distributed, as the exchange's notice names it. */
  year: number;
  /** Per share, summed over the year's declarations. */
  amount: number;
  /** How many declarations that is — two where a company pays half-yearly. */
  payments: number;
  yieldPct: number | null;
  date: string;
  url: string;
}

export interface StockAnalysis {
  sector: SectorKey;
  sectorLabel: string;
  /** True when the label is a published classification, not a guess. */
  sectorStated: boolean;
  /** Companies the ratios were compared against, this one excluded. */
  peerCount: number;
  /**
   * True when the sector had too few reporting companies and the whole
   * market was used instead — which the card says out loud, because a
   * percentile against the wrong peer group is worse than none.
   */
  comparedToMarket: boolean;
  period: string | null;
  ratios: RatioView[];
  scorecards: Record<Timeframe, Scorecard>;
  risk: RiskMetrics;
  riskYears: number;
  /**
   * Datalab's own account of the year, where it covers this company.
   *
   * Beside rather than instead of the figures above: the risk metrics here
   * are three years against the index, these are one year on their own, and
   * two windows disagreeing is not either of them being wrong. The
   * distribution is the part that has no equivalent — a histogram of what a
   * single session in this share has actually looked like.
   */
  profile: TdbProfile | null;
  distribution: TdbReturnDistribution | null;
  combined: CombinedSignal;
  dividends: DividendRow[];
  peers: PeerRow[];
  candles: Candle[];
  /** False for a listing too new or too thinly traded to read a chart from. */
  enoughHistory: boolean;
  /**
   * The same analysis run on the metal, for a listing that is the metal.
   *
   * Null for everything else. A gold tracker three months old has no history
   * to read a scorecard from and no accounts to draw a ratio from, while what
   * it holds has seventeen years of daily prices — so the panels are given
   * those instead, and say so.
   */
  goldBasis: GoldBasis | null;
}

/**
 * The dividend history, from the exchange's own notices and nothing else.
 *
 * Datalab used to be merged in here and no longer is, because the two count
 * years differently and a table cannot hold both. Datalab counts a payment in
 * the year it was paid: its АПУ 2024 is 99₮, being 44₮ paid in February for
 * the second half of 2023 plus 55₮ paid in August for the first half of 2024.
 * The exchange's notices name the year whose profit is being distributed, and
 * by that reckoning 2024 was 55₮ and 65₮ — 120₮. Neither is wrong; they answer
 * different questions. Showing one year's cash under a heading that reads as a
 * year's earnings is what made the card wrong.
 *
 * The notices win because they are the year an investor means, because the
 * exchange states them in the headline rather than leaving them to be
 * inferred, and because every row links to that headline — a figure the
 * reader can check beats one they have to trust. They also reach further:
 * 68 companies and 274 company-years against Datalab's 29 in its best year and
 * nothing at all for any bank.
 *
 * What went with Datalab is the payout ratio, which was its own year's profit
 * and so could not survive the change either.
 */
export function dividendRows(notices: Dividend[]): DividendRow[] {
  return [...notices]
    .sort((a, b) => b.year - a.year)
    .map((notice) => ({
      year: notice.year,
      amount: notice.amount,
      payments: notice.payments,
      yieldPct: notice.yieldPct,
      date: notice.date,
      url: notice.url,
    }));
}

/** Full daily OHLCV, which the chart and every indicator are built from. */
async function getCandles(
  db: Db,
  companyCode: number,
  from: string,
): Promise<Candle[]> {
  const rows = await db
    .collection<PricePoint>("prices")
    .find(
      { companyCode, date: { $gte: from } },
      { projection: { _id: 0, date: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 } },
    )
    .sort({ date: 1 })
    .toArray();

  // A session with no trades is published with zeroes in the other columns;
  // drawing those as a candle puts a wick down to the axis on a day nothing
  // happened, and feeding them to an average moves it to a price nobody paid.
  return rows
    .filter((r) => r.close > 0)
    .map((r) => ({
      date: r.date,
      open: r.open > 0 ? r.open : r.close,
      high: r.high > 0 ? r.high : r.close,
      low: r.low > 0 ? r.low : r.close,
      close: r.close,
      volume: r.volume ?? 0,
    }));
}

/** The latest report for every company, and the one a year before it. */
async function getFinancialsForPeers(db: Db): Promise<Map<number, Financials[]>> {
  const rows = await db
    .collection<Financials>("financials")
    .find({}, { sort: { companyCode: 1, year: -1, quarter: -1 } })
    .toArray();

  const byCompany = new Map<number, Financials[]>();
  for (const row of rows) {
    const list = byCompany.get(row.companyCode) ?? [];
    list.push(row);
    byCompany.set(row.companyCode, list);
  }
  return byCompany;
}

/** The most recent close stored for every company, for peer valuations. */
async function getLatestPrices(db: Db): Promise<Map<number, number>> {
  const rows = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; close: number }>(
      [
        { $match: { close: { $gt: 0 } } },
        { $sort: { date: -1 } },
        { $group: { _id: "$companyCode", close: { $first: "$close" } } },
      ],
      { allowDiskUse: true },
    )
    .toArray();
  return new Map(rows.map((r) => [r._id, r.close]));
}

/**
 * The same quarter a year earlier, which is what a year-on-year change has
 * to be measured against.
 *
 * Not simply the previous stored report: comparing a second quarter with a
 * first would read the ordinary shape of a trading year as growth. If the
 * matching quarter was never stored — the app has only been collecting these
 * since it was built — there is no comparison and the column stays empty.
 */
/**
 * Datalab's own year as a ratio set, for comparing against.
 *
 * Only used as the year-ago side of a change, never as the figures shown:
 * where MSE publishes a ratio it is MSE's that appears on the card, because
 * MSE is the exchange and its quarter is the current one.
 */
function tdbRatios(year: TdbYear): RatioInputs {
  return {
    pe: year.pe,
    pb: year.pb,
    eps: year.eps,
    bvps: year.bookValuePerShare,
    roe: year.roe,
    roa: year.roa,
    netMargin: year.netMargin,
    debtToEquity: year.debtToEquity,
    currentRatio: year.currentRatio,
    cashRatio: year.cashRatio,
  };
}

function priorYear(reports: Financials[], latest: Financials): Financials | null {
  return (
    reports.find(
      (r) => r.year === latest.year - 1 && r.quarter === latest.quarter,
    ) ?? null
  );
}

/**
 * Everything an analysis needs that is about the market rather than about
 * one company: who is listed, what they last reported, what they last
 * traded at, Datalab's closed years, and the index the beta is measured
 * against.
 *
 * Loaded apart from the per-company work because ranking one company means
 * reading all of them, and a whole-market pass — which is what the
 * dashboard's verdict is — would otherwise do that four hundred times over.
 */
export interface MarketContext {
  securities: Security[];
  financialsByCompany: Map<number, Financials[]>;
  latestPrices: Map<number, number>;
  tdb: Map<number, { latest: TdbYear; previous: TdbYear | null }>;
  top20: { date: string; value: number }[];
  /**
   * Every company's ratios from its last report and last close, worked out
   * once. Each company's peer group is a subset of these, so computing them
   * per company turned one pass into four hundred squared.
   */
  ratiosByCompany: Map<number, RatioInputs>;
}

async function loadMarketContext(db: Db): Promise<MarketContext> {
  const [financialsByCompany, latestPrices, securities, indices, tdb] =
    await Promise.all([
      getFinancialsForPeers(db),
      getLatestPrices(db),
      db.collection<Security>("securities").find({ status: "active" }).toArray(),
      // The market's own series, for the beta. Its absence costs one figure,
      // not the page.
      fetchIndexSeries().catch(() => ({})),
      // Datalab's closed years: the stated industry, the liquidity ratios MSE
      // does not publish, and last year's figures to measure a change against.
      getTdbLatest(db).catch(
        () => new Map<number, { latest: TdbYear; previous: TdbYear | null }>(),
      ),
    ]);

  const ratiosByCompany = new Map<number, RatioInputs>();
  for (const security of securities) {
    ratiosByCompany.set(
      security.companyCode,
      computeRatios(
        financialsByCompany.get(security.companyCode)?.[0] ?? null,
        latestPrices.get(security.companyCode) ?? null,
        tdb.get(security.companyCode)?.latest ?? null,
      ),
    );
  }

  return {
    securities,
    financialsByCompany,
    latestPrices,
    tdb,
    top20:
      (indices as Record<string, { date: string; value: number }[]>).top20 ?? [],
    ratiosByCompany,
  };
}

/**
 * The analysis proper, for one company, given the market around it.
 *
 * Pure: no database, no network. This is the single definition of what this
 * app thinks of a company — the ratios against its sector, the scorecards,
 * the risk figures and the verdict that follows from them. The company's
 * page and the whole-market pass behind the home list and the alerts both
 * come through here, which is what keeps them from disagreeing.
 */
export interface CompanyAnalysis {
  sector: SectorKey;
  sectorLabel: string;
  sectorStated: boolean;
  peerCount: number;
  comparedToMarket: boolean;
  period: string | null;
  ratios: RatioView[];
  scorecards: Record<Timeframe, Scorecard>;
  risk: RiskMetrics;
  combined: CombinedSignal;
  peers: PeerRow[];
}

function analyseCompany(
  context: MarketContext,
  security: Security,
  candles: Candle[],
  price: number | null,
  today: string,
): CompanyAnalysis {
  const { securities, financialsByCompany, tdb, ratiosByCompany } = context;

  const ownReports = financialsByCompany.get(security.companyCode) ?? [];
  const financials = ownReports[0] ?? null;
  const ownTdb = tdb.get(security.companyCode) ?? null;

  // Where Datalab states an industry it is used verbatim; where it does not,
  // the company falls back to being read from its name and its report layout.
  const resolved = resolveSector(
    security.name,
    security.symbol,
    financials?.reportKind,
    ownTdb?.latest.industry,
  );
  const sector = resolved.key;
  const statedIndustry = ownTdb?.latest.industry ?? null;

  // Peers are the sector's other companies that filed a report. A company is
  // never its own peer: leaving it in would pull the median towards itself
  // and guarantee it ranked mid-table.
  // A company that filed a summary with nothing in it is not a peer either:
  // its zeroes would count as a valuation and pull the sector's median with
  // them. It keeps its own page; it just does not vote on anyone else's.
  const reportingCompanies = securities.filter((s) => {
    const report = financialsByCompany.get(s.companyCode)?.[0];
    return !!report && !isBlankReport(report);
  });

  // Grouped by the stated industry where this company has one, because
  // Datalab's taxonomy is finer than the buckets here — it separates the
  // coalfields from the metal refiners, where "Уул уурхай" holds both — and
  // a peer group is only as good as the line drawn round it. Companies with
  // no stated industry fall back to the coarse key on both sides.
  const sectorMembers = reportingCompanies.filter((s) => {
    if (s.companyCode === security.companyCode) return false;
    const report = financialsByCompany.get(s.companyCode)![0];
    if (statedIndustry) return tdb.get(s.companyCode)?.latest.industry === statedIndustry;
    return classifySector(s.name, s.symbol, report.reportKind) === sector;
  });

  // An unclassified company has no sector to be compared with, and one in a
  // sector of two has no median worth the name; both fall back to the market.
  const comparedToMarket = sector === "other" || sectorMembers.length < MIN_PEERS;
  const comparisonSet = comparedToMarket
    ? reportingCompanies.filter((s) => s.companyCode !== security.companyCode)
    : sectorMembers;

  // Read from the context's precomputed table rather than worked out again
  // here: a peer's ratios are the same figures whoever is asking, and the
  // whole-market pass would otherwise recompute every company's ratios once
  // for every other company.
  const peers: SectorPeer[] = comparisonSet.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    ratios: ratiosByCompany.get(s.companyCode)!,
  }));

  const own = computeRatios(financials, price, ownTdb?.latest);

  // A year ago, from whichever source can answer it.
  //
  // MSE is preferred when the app has been running long enough to have
  // stored the same quarter last year, since that compares like with like.
  // Otherwise Datalab's previous closed year fills in — a genuine annual
  // comparison rather than a quarter against a year, and the only one
  // available at all for a company whose history here starts this month.
  // Both sides from one source. MSE against MSE where the app has kept the
  // matching quarter, Datalab's latest closed year against the one before it
  // otherwise — never MSE's half-year against Datalab's full one.
  const mseBefore = financials ? priorYear(ownReports, financials) : null;
  const change: YearOnYear | null = mseBefore
    ? { current: own, previous: computeRatios(mseBefore, price, ownTdb?.previous) }
    : ownTdb?.previous
      ? { current: tdbRatios(ownTdb.latest), previous: tdbRatios(ownTdb.previous) }
      : null;

  const ratios = buildRatioViews(own, peers, change);

  const scorecards = Object.fromEntries(
    TIMEFRAMES.map(({ key }) => [key, buildScorecard(candles, key)]),
  ) as Record<Timeframe, Scorecard>;

  const risk = computeRisk(
    candles,
    // TOP-20 is the exchange's headline index and the closest thing this
    // market has to "the market".
    context.top20,
    today,
  );

  const combined = combineSignal({
    scorecard: scorecards["1D"],
    ratios,
    risk,
    sectorLabel: resolved.label,
    peerCount: peers.length,
  });

  // Ranked by the sector's own valuation so the table reads as a league
  // table, with this company shown in place among them.
  const peerRows: PeerRow[] = [
    ...peers.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      pe: p.ratios.pe,
      pb: p.ratios.pb,
      roe: p.ratios.roe,
      self: false,
    })),
    {
      symbol: security.symbol,
      name: security.name,
      pe: own.pe,
      pb: own.pb,
      roe: own.roe,
      self: true,
    },
  ].sort((a, b) => (b.roe ?? -Infinity) - (a.roe ?? -Infinity));

  return {
    sector,
    sectorLabel: resolved.label,
    sectorStated: resolved.stated,
    peerCount: peers.length,
    comparedToMarket,
    period: financials?.period ?? null,
    ratios,
    scorecards,
    risk,
    combined,
    peers: peerRows,
  };
}

/**
 * Every listed company's candles at once, for the whole-market pass.
 *
 * One aggregate rather than four hundred queries. The window matches what a
 * company's own page reads, because a verdict computed from a shorter
 * history is a different verdict — MA200 alone needs two hundred sessions,
 * and this market does not trade every company every day.
 */
async function getCandlesForAll(db: Db, from: string): Promise<Map<number, Candle[]>> {
  const rows = await db
    .collection<PricePoint>("prices")
    .find(
      { date: { $gte: from }, close: { $gt: 0 } },
      {
        projection: {
          _id: 0,
          companyCode: 1,
          date: 1,
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        },
      },
    )
    .sort({ companyCode: 1, date: 1 })
    .toArray();

  const byCompany = new Map<number, Candle[]>();
  for (const row of rows) {
    const list = byCompany.get(row.companyCode) ?? [];
    list.push({
      date: row.date,
      open: row.open > 0 ? row.open : row.close,
      high: row.high > 0 ? row.high : row.close,
      low: row.low > 0 ? row.low : row.close,
      close: row.close,
      volume: row.volume ?? 0,
    });
    byCompany.set(row.companyCode, list);
  }
  return byCompany;
}

/**
 * The verdict for every listed company, from the same code one company's
 * page uses.
 *
 * This exists because the app used to hold two opinions at once. The home
 * list and the alerts came from a six-indicator rule engine; the company's
 * page came from this analysis. They disagreed often enough that a reader
 * was told MBW had moved to ХҮЛЭЭХ and then found ЗАРАХ on the page the
 * alert linked to. There is one verdict now, and this is where the rest of
 * the app reads it.
 */
export async function buildCombinedSignals(
  db: Db,
  today: string,
  live?: Map<number, LiveQuote>,
): Promise<Map<number, CombinedSignal>> {
  const from = `${Number(today.slice(0, 4)) - HISTORY_YEARS}${today.slice(4)}`;
  const [context, candlesByCompany] = await Promise.all([
    loadMarketContext(db),
    getCandlesForAll(db, from),
  ]);

  const out = new Map<number, CombinedSignal>();
  for (const security of context.securities) {
    const candles = withLiveCandle(
      candlesByCompany.get(security.companyCode) ?? [],
      live?.get(security.companyCode),
    );
    if (candles.length === 0) continue;
    // The price every ratio is measured against, same as the page: the
    // running quote where there is one, the last close otherwise.
    const price = candles.at(-1)!.close;
    try {
      out.set(
        security.companyCode,
        analyseCompany(context, security, candles, price, today).combined,
      );
    } catch (err) {
      // One company that cannot be analysed must not cost the other four
      // hundred their verdict.
      console.error(`combined signal failed for ${security.symbol}`, err);
    }
  }
  return out;
}

/**
 * One company's full analysis, for its own page.
 *
 * The market context and the dividend history are what this adds over
 * `analyseCompany`; the verdict itself is that function's, unchanged, so the
 * headline on this page is the same verdict the home list and the alerts
 * carry.
 */
export async function buildAnalysis(
  db: Db,
  security: Security,
  price: number | null,
  today: string,
  /**
   * The running quote, so the chart and every indicator reach today rather
   * than stopping at the last published session. The exchange publishes a
   * day only once it has closed, so without this the chart ends on
   * yesterday's close while the header above it quotes this morning.
   */
  live?: LiveQuote | null,
): Promise<StockAnalysis> {
  const from = `${Number(today.slice(0, 4)) - HISTORY_YEARS}${today.slice(4)}`;

  const [storedCandles, context, noticeDividends, tdb, goldPoints] =
    await Promise.all([
      getCandles(db, security.companyCode, from),
      loadMarketContext(db),
      getDividendHistory(db, security.companyCode, price).catch(() => []),
      getTdbProfile(db, security.companyCode).catch(() => ({
        profile: null,
        distribution: null,
      })),
      // Only for the listings that are a metal. Every other company reads
      // its own history, and asking Mongolbank about APU would be a request
      // per page view for a series nothing on the page would draw.
      tracksGold(security.symbol)
        ? getGoldPrices(db).catch((err) => {
            console.error("gold basis unavailable", err);
            return [];
          })
        : Promise.resolve([]),
    ]);

  // Today's bar goes on before anything is computed from the series, so the
  // scorecards, the risk figures and the chart all describe the same market.
  const candles = withLiveCandle(storedCandles, live);
  const analysis = analyseCompany(context, security, candles, price, today);
  const goldBasis = buildGoldBasis(goldPoints, candles, context.top20, today);

  return {
    ...analysis,
    // The verdict is the three readings added up, so where the readings come
    // from the metal it has to as well. Left as the company's own otherwise.
    // Ratios stay empty for a fund that files none, and the score is
    // renormalised over the parts that exist — which is the honest reading:
    // a tracker has a chart and a risk profile and no accounts.
    combined: goldBasis
      ? combineSignal({
          scorecard: goldBasis.scorecards["1D"],
          ratios: analysis.ratios,
          risk: goldBasis.risk,
          sectorLabel: analysis.sectorLabel,
          peerCount: analysis.peerCount,
        })
      : analysis.combined,
    riskYears: RISK_YEARS,
    profile: tdb.profile,
    distribution: tdb.distribution,
    dividends: dividendRows(noticeDividends),
    candles,
    enoughHistory: candles.length >= MIN_CANDLES,
    goldBasis,
  };
}
