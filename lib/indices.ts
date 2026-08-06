import type { Db } from "mongodb";
import { fetchIndexSeries, INDEX_KEYS, type IndexKey } from "@/lib/mse/indices";
import { fetchLiveIndices } from "@/lib/marketinfo/indices";
import { fetchLiveIndexTable, type LiveIndexTable } from "@/lib/mse/movers";

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
  /** True when the level is the running one rather than a stored close. */
  live?: boolean;
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
/**
 * Replaces the stored level with the running one where marketinfo has it.
 *
 * The exchange's series ends at the previous session, so on its own the
 * cards would show yesterday's level all through today's trading. The
 * series is still what draws the trend line; only the headline figure and
 * its change come from the live feed, with today's point appended so the
 * line ends where the number says it does.
 */
const EXCHANGE_LEVELS: Record<
  IndexKey,
  [keyof LiveIndexTable, keyof LiveIndexTable, keyof LiveIndexTable]
> = {
  top20: ["top20Unit", "top20Change", "top20Percent"],
  mseA: ["mseAUnit", "mseAChange", "mseAPercent"],
  mseB: ["mseBUnit", "mseBChange", "mseBPercent"],
};

async function withLiveLevels(
  indices: MarketIndexView[],
): Promise<MarketIndexView[]> {
  // The exchange's own front page first: it is the exchange, and it is
  // current the moment the index moves. marketinfo is the fallback.
  const table = await fetchLiveIndexTable().catch(() => null);
  if (table) {
    return indices.map((index) => {
      const keys = EXCHANGE_LEVELS[index.key];
      if (!keys) return index;
      const [unit, change, percent] = keys;
      const value = table[unit];
      if (!Number.isFinite(value) || value <= 0) return index;
      return {
        ...index,
        value,
        change: table[change],
        changePct: table[percent],
        sparkline: [...index.sparkline.slice(0, -1), value],
        live: true,
      };
    });
  }

  let live: Awaited<ReturnType<typeof fetchLiveIndices>>;
  try {
    live = await fetchLiveIndices();
  } catch {
    return indices;
  }
  if (live.size === 0) return indices;

  return indices.map((index) => {
    const current = live.get(index.key);
    if (!current) return index;
    return {
      ...index,
      value: current.value,
      change: current.change,
      changePct: current.changePct,
      date: current.date ?? index.date,
      sparkline:
        current.date && current.date > index.date
          ? [...index.sparkline.slice(1), current.value]
          : [...index.sparkline.slice(0, -1), current.value],
      live: true,
    };
  });
}

export async function getMarketIndices(db: Db): Promise<MarketIndexView[]> {
  const snapshots = db.collection<IndexSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });

  if (cached && Date.now() - cached.computedAt.getTime() < SNAPSHOT_TTL_MS) {
    return withLiveLevels(cached.indices);
  }

  try {
    const indices = await computeMarketIndices();
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      { $set: { key: SNAPSHOT_KEY, indices, computedAt: new Date() } },
      { upsert: true },
    );
    return withLiveLevels(indices);
  } catch (err) {
    // Yesterday's levels beat an empty row if MSE is briefly unreachable or
    // has redeployed behind a new action id.
    console.error("index refresh failed", err);
    return cached ? withLiveLevels(cached.indices) : [];
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
