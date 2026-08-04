import type { Db } from "mongodb";
import { computeRecommendation } from "@/lib/recommendation";
import { syncPricesForCompany } from "@/lib/sync";
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
  const changePct =
    last && prev && prev.close > 0
      ? ((last.close - prev.close) / prev.close) * 100
      : null;

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

export async function computeDashboardRows(db: Db): Promise<DashboardRow[]> {
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
      pricesByCompany.get(security.companyCode) ?? [],
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
const DASHBOARD_SCHEMA_VERSION = 2;

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
    const rows = await computeDashboardRows(db);
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

/** Rebuild the snapshot immediately (called after a sync ingests new prices). */
export async function refreshDashboardSnapshot(db: Db): Promise<number> {
  const rows = await computeDashboardRows(db);
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

export async function getStockDetail(
  db: Db,
  symbol: string,
): Promise<StockDetail | null> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) return null;

  const [prices, financialsByCompany] = await Promise.all([
    getRecentPrices(db, security.companyCode),
    getLatestFinancialsByCompany(db),
  ]);

  const marketMedianPe = getMarketMedianPe(financialsByCompany);
  const financials = financialsByCompany.get(security.companyCode) ?? null;
  const recommendation = computeRecommendation(prices, financials, marketMedianPe);

  return {
    security,
    financials,
    priceHistory: prices,
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
