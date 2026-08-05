import type { Db } from "mongodb";
import { computeRecommendation } from "@/lib/recommendation";
import { syncPricesForCompany } from "@/lib/sync";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/marketinfo/quotes";
import { daysBetween, sessionChangePct } from "@/lib/priceChange";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";

const INDICATOR_WINDOW_DAYS = 400;
const SPARKLINE_POINTS = 20;
const SPARKLINE_WINDOW_DAYS = 30;

export interface DashboardRow {
  symbol: string;
  name: string;
  classification: Security["classification"];
  companyCode: number;
  lastPrice: number | null;
  lastDate: string | null;
  changePct: number | null;
  volume: number | null;
  signal: Recommendation["signal"];
  score: number;
  /** Recent closing prices, oldest first, for the dashboard-row mini chart. */
  sparkline: number[];
}

export interface StockDetail {
  security: Security;
  financials: Financials | null;
  priceHistory: PricePoint[];
  /** Every stored close, oldest first, for the chart's longer ranges. */
  fullHistory: { date: string; close: number }[];
  recommendation: Recommendation;
  marketMedianPe: number | null;
}

async function getLatestFinancialsByCompany(
  db: Db,
): Promise<Map<number, Financials>> {
  const rows = await db
    .collection<Financials>("financials")
    .aggregate<Financials>([
      { $sort: { companyCode: 1, year: -1, quarter: -1 } },
      {
        $group: {
          _id: "$companyCode",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r.companyCode, r]));
}

function getMarketMedianPe(financialsByCompany: Map<number, Financials>): number | null {
  const values = Array.from(financialsByCompany.values())
    .map((f) => f.pe)
    .filter((v): v is number => v !== null && v > 0 && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];
}

/**
 * Date and close for a company's whole stored history. Projected down to
 * two fields because the chart needs nothing else and a heavily traded
 * name carries thousands of rows.
 */
async function getFullPriceSeries(
  db: Db,
  companyCode: number,
): Promise<{ date: string; close: number }[]> {
  return db
    .collection<PricePoint>("prices")
    .find({ companyCode }, { projection: { _id: 0, date: 1, close: 1 } })
    .sort({ date: 1 })
    .toArray() as unknown as Promise<{ date: string; close: number }[]>;
}

async function getRecentPrices(
  db: Db,
  companyCode: number,
  limit = INDICATOR_WINDOW_DAYS,
): Promise<PricePoint[]> {
  const rows = await db
    .collection<PricePoint>("prices")
    .find({ companyCode })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return rows.reverse();
}

/**
 * Latest `limit` price points for every company in a single aggregation.
 *
 * Fetching these per-company means one Atlas round trip per listed security
 * (200+), which dominated page load time. `$topN` keeps the per-group slice on
 * the server so we transfer only what the indicators actually need.
 */
async function getRecentPricesForAll(
  db: Db,
  limit = INDICATOR_WINDOW_DAYS,
): Promise<Map<number, PricePoint[]>> {
  const groups = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; prices: PricePoint[] }>(
      [
        {
          $group: {
            _id: "$companyCode",
            prices: {
              $topN: {
                n: limit,
                sortBy: { date: -1 },
                output: {
                  companyCode: "$companyCode",
                  date: "$date",
                  open: "$open",
                  close: "$close",
                  high: "$high",
                  low: "$low",
                  vwap: "$vwap",
                  volume: "$volume",
                  turnover: "$turnover",
                  trades: "$trades",
                  previousClose: "$previousClose",
                },
              },
            },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  // $topN yields newest-first; indicators expect chronological order.
  return new Map(groups.map((g) => [g._id, g.prices.reverse()]));
}

/**
 * Closing prices for the mini trend line, bounded to the last
 * SPARKLINE_WINDOW_DAYS calendar days (not just the last N trades). Without
 * the calendar bound, a thinly-traded security's "last 20 prices" can be
 * its entire multi-year trading history rather than a recent trend.
 */
function recentSparkline(prices: PricePoint[]): number[] {
  if (prices.length === 0) return [];
  const cutoff = new Date(prices[prices.length - 1].date);
  cutoff.setUTCDate(cutoff.getUTCDate() - SPARKLINE_WINDOW_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const windowed = prices
    .filter((p) => p.date >= cutoffKey)
    .slice(-SPARKLINE_POINTS);
  // A row always has at least two raw price points once it has a change% at
  // all (that's what produces it), but for a thinly-traded security those
  // two trades can be further apart than the calendar window — which left
  // exactly the gainers/losers rows (the ones that just traded) with no line
  // to draw. Fall back to the plain last-N points rather than showing
  // nothing when the windowed slice is too sparse to plot.
  const source = windowed.length >= 2 ? windowed : prices.slice(-SPARKLINE_POINTS);
  return source.map((p) => p.close);
}

function buildRow(
  security: Security,
  prices: PricePoint[],
  financials: Financials | null,
  marketMedianPe: number | null,
): DashboardRow {
  const recommendation = computeRecommendation(prices, financials, marketMedianPe);
  const last = prices.at(-1) ?? null;
  const prev = prices.length > 1 ? prices[prices.length - 2] : null;
  const changePct = sessionChangePct(last, prev);

  return {
    symbol: security.symbol,
    name: security.name,
    classification: security.classification,
    companyCode: security.companyCode,
    lastPrice: last?.close ?? null,
    lastDate: last?.date ?? null,
    changePct,
    volume: last?.volume ?? null,
    signal: recommendation.signal,
    score: recommendation.score,
    sparkline: recentSparkline(prices),
  };
}

/**
 * Adds the running price to a company's series as today's point.
 *
 * Indicators computed from stored closes alone describe the market as it
 * stood at the last published session, so a stock that fell 15% this
 * morning still carried yesterday's АВАХ. The signal has to see the price
 * the screen is showing.
 */
function withLivePoint(
  prices: PricePoint[],
  live: LiveQuote | undefined,
  companyCode: number,
): PricePoint[] {
  const date = live?.at?.slice(0, 10);
  if (!live || live.price === null || !date) return prices;

  const point: PricePoint = {
    companyCode,
    date,
    close: live.price,
    open: live.open ?? undefined,
    high: live.high ?? undefined,
    low: live.low ?? undefined,
    volume: live.volume ?? undefined,
    previousClose: live.previousClose ?? undefined,
  } as PricePoint;

  const lastStored = prices.at(-1);
  if (lastStored?.date === date) return [...prices.slice(0, -1), point];
  if (!lastStored || lastStored.date < date) return [...prices, point];
  return prices;
}

async function computeDashboardRows(
  db: Db,
  options: { live?: Map<number, LiveQuote> } = {},
): Promise<DashboardRow[]> {
  const [securities, financialsByCompany, pricesByCompany] = await Promise.all([
    db
      .collection<Security>("securities")
      .find({ status: "active" })
      .sort({ symbol: 1 })
      .toArray(),
    getLatestFinancialsByCompany(db),
    getRecentPricesForAll(db),
  ]);

  const marketMedianPe = getMarketMedianPe(financialsByCompany);

  return securities.map((security) =>
    buildRow(
      security,
      withLivePoint(
        pricesByCompany.get(security.companyCode) ?? [],
        options.live?.get(security.companyCode),
        security.companyCode,
      ),
      financialsByCompany.get(security.companyCode) ?? null,
      marketMedianPe,
    ),
  );
}

const SNAPSHOT_KEY = "dashboardRows";
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
/**
 * Bump this whenever buildRow's logic changes in a way that should reach
 * users immediately rather than waiting out SNAPSHOT_TTL_MS or a background
 * sync — e.g. the sparkline calendar-window fallback below. A stored
 * snapshot from an older version is treated as stale regardless of age.
 */
const DASHBOARD_SCHEMA_VERSION = 3;

interface MarketSnapshot {
  key: string;
  rows: DashboardRow[];
  computedAt: Date;
  schemaVersion?: number;
}

/**
 * Dashboard rows served from a stored snapshot. MSE publishes prices once a
 * day, so recomputing indicators for every listed company on each page view is
 * wasted work; the snapshot turns it into a single small read.
 */
export async function getDashboardRows(db: Db): Promise<DashboardRow[]> {
  const snapshots = db.collection<MarketSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  const cacheIsFresh =
    !!cached && Date.now() - cached.computedAt.getTime() < SNAPSHOT_TTL_MS;
  const cacheIsCurrentVersion = cached?.schemaVersion === DASHBOARD_SCHEMA_VERSION;

  if (cached && cacheIsFresh && cacheIsCurrentVersion) {
    return cached.rows;
  }

  try {
    const live = await fetchLiveQuotes().catch(() => new Map());
    const rows = await computeDashboardRows(db, { live });
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          rows,
          computedAt: new Date(),
          schemaVersion: DASHBOARD_SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
    return rows;
  } catch (err) {
    // A stale snapshot beats an error page if the recompute fails, even one
    // from an older row shape — components tolerate missing new fields.
    if (cached) {
      console.error("dashboard recompute failed, serving stale snapshot", err);
      return cached.rows;
    }
    throw err;
  }
}

/**
 * Overlays the running price on rows served from the snapshot.
 *
 * The snapshot is built from stored closes, so during a session every list
 * — the market list, gainers, losers — shows the previous day's figures
 * while the detail page shows the live one. Only the price, its change and
 * the last sparkline point move; the signal and score stay as computed, so
 * a intraday tick cannot flap a recommendation.
 *
 * Deliberately not folded into getDashboardRows: the sync job reads those
 * rows too, and has no business making a third-party call.
 */
export async function applyLiveQuotes(
  rows: DashboardRow[],
  options: { extraCaCerts?: string } = {},
): Promise<DashboardRow[]> {
  let quotes: Awaited<ReturnType<typeof fetchLiveQuotes>>;
  try {
    quotes = await fetchLiveQuotes(options);
  } catch {
    return rows;
  }
  if (quotes.size === 0) return rows;

  return rows.map((row) => {
    const live = quotes.get(row.companyCode);
    if (!live || live.price === null) return row;
    return {
      ...row,
      lastPrice: live.price,
      changePct: live.changePct,
      lastDate: live.at?.slice(0, 10) ?? row.lastDate,
      volume: live.volume ?? row.volume,
      // Keep the line ending where the number says it does.
      sparkline:
        row.sparkline.length > 0
          ? [...row.sparkline.slice(0, -1), live.price]
          : row.sparkline,
    };
  });
}

/**
 * The most recent session any row carries — the market's "today".
 *
 * Rows are dated by when the security last traded, and on MSE that is a very
 * uneven thing: of 423 listings only about 50 change hands on a given day,
 * while some have not traded since 2006. The newest date across all rows is
 * therefore the last session the market held.
 */
export function latestSessionDate(rows: DashboardRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.lastDate && (!latest || row.lastDate > latest)) latest = row.lastDate;
  }
  return latest;
}

/**
 * Rows that actually traded in the latest session.
 *
 * Gainers and losers are statements about that session, so a security whose
 * newest price is months old belongs to neither list however far it moved on
 * the day it last traded.
 */
export function tradedInLatestSession(rows: DashboardRow[]): DashboardRow[] {
  const session = latestSessionDate(rows);
  if (!session) return [];
  return rows.filter((r) => r.lastDate === session);
}

/**
 * Rows priced within `days` of the latest session. Indicators computed from a
 * series that stops years ago describe a market that no longer exists, so a
 * ranking by score has to bound how stale its inputs may be.
 */
export function pricedRecently(rows: DashboardRow[], days: number): DashboardRow[] {
  const session = latestSessionDate(rows);
  if (!session) return [];
  return rows.filter(
    (r) => r.lastDate !== null && daysBetween(r.lastDate, session) <= days,
  );
}

/** Rebuild the snapshot immediately (called after a sync ingests new prices). */
export async function refreshDashboardSnapshot(db: Db): Promise<number> {
  const live = await fetchLiveQuotes().catch(() => new Map());
  const rows = await computeDashboardRows(db, { live });
  await db.collection<MarketSnapshot>("marketSnapshots").updateOne(
    { key: SNAPSHOT_KEY },
    {
      $set: {
        key: SNAPSHOT_KEY,
        rows,
        computedAt: new Date(),
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
      },
    },
    { upsert: true },
  );
  return rows.length;
}

async function getStockDetail(
  db: Db,
  symbol: string,
): Promise<StockDetail | null> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) return null;

  const [prices, fullHistory, financialsByCompany] = await Promise.all([
    getRecentPrices(db, security.companyCode),
    getFullPriceSeries(db, security.companyCode),
    getLatestFinancialsByCompany(db),
  ]);

  const marketMedianPe = getMarketMedianPe(financialsByCompany);
  const financials = financialsByCompany.get(security.companyCode) ?? null;
  const live = await fetchLiveQuotes().catch(() => new Map());
  const recommendation = computeRecommendation(
    withLivePoint(prices, live.get(security.companyCode), security.companyCode),
    financials,
    marketMedianPe,
  );

  return {
    security,
    financials,
    priceHistory: prices,
    fullHistory,
    recommendation,
    marketMedianPe,
  };
}

/**
 * Same as getStockDetail, but first pulls this one company's price live from
 * MSE. The background sync rotates through ~200 companies on a time-boxed
 * cursor, so a given symbol's cached price can be many cycles stale; a
 * single company's page is one cheap fetch, so pages that show "today's"
 * price or chart use this instead. Falls back to whatever was already
 * cached if the live fetch fails (network hiccup, MSE briefly down, etc).
 */
export async function getStockDetailFresh(
  db: Db,
  symbol: string,
): Promise<StockDetail | null> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) return null;

  try {
    await syncPricesForCompany(db, security.companyCode);
  } catch (err) {
    console.error(`live price refresh failed for ${symbol}`, err);
  }

  return getStockDetail(db, symbol);
}
