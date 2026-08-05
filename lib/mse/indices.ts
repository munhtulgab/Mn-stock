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

/**
 * Full daily history for the three headline indices, oldest point first.
 * Indices that fail to load are omitted rather than failing the whole fetch —
 * two out of three cards still beats none.
 */
export async function fetchIndexSeries(): Promise<Record<string, IndexPoint[]>> {
  const series: Record<string, IndexPoint[]> = {};
  const results = await Promise.all(
    INDEX_KEYS.map(({ action }) =>
      callMseAction(action, "?lang=mn", isIndexPointArray).catch(() => null),
    ),
  );
  INDEX_KEYS.forEach(({ key }, i) => {
    const points = results[i];
    if (points) series[key] = points;
  });

  if (Object.keys(series).length === 0) {
    throw new Error("MSE returned no index series");
  }
  return series;
}
