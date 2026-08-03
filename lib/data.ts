import type { Db } from "mongodb";
import { computeRecommendation } from "@/lib/recommendation";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";

const INDICATOR_WINDOW_DAYS = 400;

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

interface MarketSnapshot {
  key: string;
  rows: DashboardRow[];
  computedAt: Date;
}

/**
 * Dashboard rows served from a stored snapshot. MSE publishes prices once a
 * day, so recomputing indicators for every listed company on each page view is
 * wasted work; the snapshot turns it into a single small read.
 */
export async function getDashboardRows(db: Db): Promise<DashboardRow[]> {
  const snapshots = db.collection<MarketSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });

  if (cached && Date.now() - cached.computedAt.getTime() < SNAPSHOT_TTL_MS) {
    return cached.rows;
  }

  try {
    const rows = await computeDashboardRows(db);
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      { $set: { key: SNAPSHOT_KEY, rows, computedAt: new Date() } },
      { upsert: true },
    );
    return rows;
  } catch (err) {
    // A stale snapshot beats an error page if the recompute fails.
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
    { $set: { key: SNAPSHOT_KEY, rows, computedAt: new Date() } },
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
