import type { Db } from "mongodb";
import type { Financials, PricePoint, Security } from "@/lib/types";
import { fetchIndexSeries } from "@/lib/mse/indices";
import { getDividendHistory, type Dividend } from "@/lib/dividends";
import { classifySector, resolveSector, type SectorKey } from "./sectors";
import { getTdbDividends, getTdbLatest } from "@/lib/tdb/store";
import type { TdbDividend, TdbYear } from "@/lib/tdb/datalab";
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
import { combineSignal, type CombinedSignal } from "./signal";
import { TIMEFRAMES, type Candle, type Timeframe } from "./series";

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

/**
 * One year's payout, from whichever source knew about it.
 *
 * `date` and `url` are present only where the exchange announced it, so a
 * reader can always tell a figure they can check from one they cannot.
 */
export interface DividendRow {
  year: number;
  amount: number;
  yieldPct: number | null;
  payoutRatio: number | null;
  date: string | null;
  url: string | null;
  source: "mse" | "tdb";
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
  combined: CombinedSignal;
  dividends: DividendRow[];
  peers: PeerRow[];
  candles: Candle[];
  /** False for a listing too new or too thinly traded to read a chart from. */
  enoughHistory: boolean;
}

/**
 * One dividend history out of the two sources that have one.
 *
 * The exchange's own notices are authoritative and carry a date and a link
 * to the announcement, but they only reach back as far as the newsroom does
 * and cover 34 companies. Datalab covers 83 and goes back five years, with
 * the payout ratio, but states only a year.
 *
 * So a year the exchange announced keeps the exchange's row — the figure, the
 * date, the link — and Datalab fills in the years it does not have. The two
 * agree where they overlap: Хаан банк's 2025 payment reads 214₮ in the
 * notices and Datalab's summary states the same 214₮.
 */
function mergeDividends(
  notices: Dividend[],
  datalab: TdbDividend[],
  price: number | null,
): DividendRow[] {
  const rows = new Map<number, DividendRow>();

  for (const entry of datalab) {
    rows.set(entry.year, {
      year: entry.year,
      amount: entry.amountPerShare,
      yieldPct:
        entry.yieldPct ??
        (price && price > 0 ? (entry.amountPerShare / price) * 100 : null),
      payoutRatio: entry.payoutRatio,
      date: null,
      url: null,
      source: "tdb",
    });
  }

  // Second, so the exchange's own announcement wins the year outright.
  for (const notice of notices) {
    rows.set(notice.year, {
      year: notice.year,
      amount: notice.amount,
      yieldPct: notice.yieldPct,
      payoutRatio: rows.get(notice.year)?.payoutRatio ?? null,
      date: notice.date,
      url: notice.url,
      source: "mse",
    });
  }

  return [...rows.values()].sort((a, b) => b.year - a.year);
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

export async function buildAnalysis(
  db: Db,
  security: Security,
  price: number | null,
  today: string,
): Promise<StockAnalysis> {
  const from = `${Number(today.slice(0, 4)) - HISTORY_YEARS}${today.slice(4)}`;

  const [
    candles,
    financialsByCompany,
    pricesByCompany,
    securities,
    noticeDividends,
    indices,
    tdb,
    tdbDividends,
  ] = await Promise.all([
    getCandles(db, security.companyCode, from),
    getFinancialsForPeers(db),
    getLatestPrices(db),
    db.collection<Security>("securities").find({ status: "active" }).toArray(),
    getDividendHistory(db, security.companyCode, price).catch(() => []),
    // The market's own series, for the beta. Its absence costs one figure,
    // not the page.
    fetchIndexSeries().catch(() => ({})),
    // Datalab's closed years: the stated industry, the liquidity ratios MSE
    // does not publish, and last year's figures to measure a change against.
    getTdbLatest(db).catch(() => new Map<number, { latest: TdbYear; previous: TdbYear | null }>()),
    getTdbDividends(db, security.companyCode).catch(() => []),
  ]);

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

  const peers: SectorPeer[] = comparisonSet.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    ratios: computeRatios(
      financialsByCompany.get(s.companyCode)?.[0] ?? null,
      pricesByCompany.get(s.companyCode) ?? null,
      tdb.get(s.companyCode)?.latest ?? null,
    ),
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
    (indices as Record<string, { date: string; value: number }[]>).top20 ?? [],
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
    riskYears: RISK_YEARS,
    combined,
    dividends: mergeDividends(noticeDividends, tdbDividends, price),
    peers: peerRows,
    candles,
    enoughHistory: candles.length >= MIN_CANDLES,
  };
}
