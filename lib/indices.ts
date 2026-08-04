import type { Db } from "mongodb";
import { fetchIndexSeries, INDEX_KEYS, type IndexKey } from "@/lib/mse/indices";

/** Trading days drawn in a card's mini trend line. */
const SPARKLINE_POINTS = 30;
const SNAPSHOT_KEY = "marketIndices";
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

export interface MarketIndexView {
  key: IndexKey;
  label: string;
  /** Latest index level, in index points. */
  value: number;
  date: string;
  change: number | null;
  changePct: number | null;
  sparkline: number[];
}

interface IndexSnapshot {
  key: string;
  indices: MarketIndexView[];
  computedAt: Date;
}

async function computeMarketIndices(): Promise<MarketIndexView[]> {
  const series = await fetchIndexSeries();

  return INDEX_KEYS.flatMap(({ key, label }) => {
    const points = series[key];
    if (!points || points.length === 0) return [];

    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2] : null;
    const change = prev ? last.value - prev.value : null;

    return [
      {
        key,
        label,
        value: last.value,
        date: last.date,
        change,
        changePct:
          prev && prev.value > 0 ? ((last.value - prev.value) / prev.value) * 100 : null,
        sparkline: points.slice(-SPARKLINE_POINTS).map((p) => p.value),
      },
    ];
  });
}

/**
 * Index cards served from a stored snapshot. MSE publishes one index point per
 * trading day, so scraping the full history on every page view would be an
 * expensive way to learn nothing new.
 */
export async function getMarketIndices(db: Db): Promise<MarketIndexView[]> {
  const snapshots = db.collection<IndexSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });

  if (cached && Date.now() - cached.computedAt.getTime() < SNAPSHOT_TTL_MS) {
    return cached.indices;
  }

  try {
    const indices = await computeMarketIndices();
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      { $set: { key: SNAPSHOT_KEY, indices, computedAt: new Date() } },
      { upsert: true },
    );
    return indices;
  } catch (err) {
    // Yesterday's levels beat an empty row if MSE is briefly unreachable or
    // has redeployed behind a new action id.
    console.error("index refresh failed", err);
    return cached?.indices ?? [];
  }
}

/** Rebuild the index snapshot immediately (called after a price sync). */
export async function refreshMarketIndices(db: Db): Promise<number> {
  const indices = await computeMarketIndices();
  await db
    .collection<IndexSnapshot>("marketSnapshots")
    .updateOne(
      { key: SNAPSHOT_KEY },
      { $set: { key: SNAPSHOT_KEY, indices, computedAt: new Date() } },
      { upsert: true },
    );
  return indices.length;
}
