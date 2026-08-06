import { callMseAction } from "./action";

/**
 * MSE index series (TOP-20, MSE-A, MSE-B), read through the site's own data
 * fetcher — see `lib/mse/action.ts` for how that call is made.
 */

export type IndexKey = "top20" | "mseA" | "mseB";

export const INDEX_KEYS: { key: IndexKey; action: string; label: string }[] = [
  { key: "top20", action: "top20Data", label: "TOP-20" },
  { key: "mseA", action: "mseAData", label: "MSE-A" },
  { key: "mseB", action: "mseBData", label: "MSE-B" },
];

export interface IndexPoint {
  date: string; // YYYY-MM-DD
  value: number;
  high: number;
  low: number;
}

function isIndexPointArray(value: unknown): value is IndexPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof (value[0] as IndexPoint)?.date === "string" &&
    typeof (value[0] as IndexPoint)?.value === "number"
  );
}

/** How long a fetched history is reused before the exchange is asked again. */
const CACHE_MS = 10 * 60 * 1000;

/**
 * The last history we successfully read for each index.
 *
 * Each index is a separate call, so a single flaky one used to make that
 * index vanish from whatever was being built — which showed up as one card
 * listing TOP-20 and MSE-A while the card beside it listed only MSE-B. The
 * exchange publishes one point per index per trading day, so a history from
 * a few minutes ago is the same history; holding on to it turns a dropped
 * call into an unchanged number instead of a missing row.
 */
const lastGood = new Map<IndexKey, IndexPoint[]>();
let cache: { at: number; series: Record<string, IndexPoint[]> } | null = null;

/**
 * Full daily history for the three headline indices, oldest point first.
 * An index that fails and has never been read is omitted rather than failing
 * the whole fetch — two out of three cards still beats none.
 */
export async function fetchIndexSeries(): Promise<Record<string, IndexPoint[]>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.series;

  const series: Record<string, IndexPoint[]> = {};
  const results = await Promise.all(
    INDEX_KEYS.map(({ action }) =>
      callMseAction(action, "?lang=mn", isIndexPointArray).catch(() => null),
    ),
  );
  INDEX_KEYS.forEach(({ key }, i) => {
    const points = results[i] ?? lastGood.get(key);
    if (points) series[key] = points;
    if (results[i]) lastGood.set(key, results[i]!);
  });

  if (Object.keys(series).length === 0) {
    throw new Error("MSE returned no index series");
  }
  // Only a complete read is worth holding: a partial one should be retried
  // on the next call, not served for the next ten minutes.
  if (results.every(Boolean)) cache = { at: Date.now(), series };
  return series;
}
