import type { Db } from "mongodb";
import type { Financials, PricePoint, Security } from "@/lib/types";
import { fetchIndexSeries } from "@/lib/mse/indices";
import { getDividendHistory, type Dividend } from "@/lib/dividends";
import { classifySector, SECTOR_LABELS, type SectorKey } from "./sectors";
import {
  buildRatioViews,
  computeRatios,
  isBlankReport,
  type RatioView,
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

export interface StockAnalysis {
  sector: SectorKey;
  sectorLabel: string;
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
  dividends: Dividend[];
  peers: PeerRow[];
  candles: Candle[];
  /** False for a listing too new or too thinly traded to read a chart from. */
  enoughHistory: boolean;
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

  const [candles, financialsByCompany, pricesByCompany, securities, dividends, indices] =
    await Promise.all([
      getCandles(db, security.companyCode, from),
      getFinancialsForPeers(db),
      getLatestPrices(db),
      db.collection<Security>("securities").find({ status: "active" }).toArray(),
      getDividendHistory(db, security.companyCode, price).catch(() => []),
      // The market's own series, for the beta. Its absence costs one figure,
      // not the page.
      fetchIndexSeries().catch(() => ({})),
    ]);

  const ownReports = financialsByCompany.get(security.companyCode) ?? [];
  const financials = ownReports[0] ?? null;
  const sector = classifySector(security.name, security.symbol, financials?.reportKind);

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

  const sectorMembers = reportingCompanies.filter((s) => {
    if (s.companyCode === security.companyCode) return false;
    const report = financialsByCompany.get(s.companyCode)![0];
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
    ),
  }));

  const own = computeRatios(financials, price);
  const before = financials ? priorYear(ownReports, financials) : null;
  const ratios = buildRatioViews(
    own,
    peers,
    before ? computeRatios(before, price) : null,
  );

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
    sectorLabel: SECTOR_LABELS[sector],
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
    sectorLabel: SECTOR_LABELS[sector],
    peerCount: peers.length,
    comparedToMarket,
    period: financials?.period ?? null,
    ratios,
    scorecards,
    risk,
    riskYears: RISK_YEARS,
    combined,
    dividends,
    peers: peerRows,
    candles,
    enoughHistory: candles.length >= MIN_CANDLES,
  };
}
