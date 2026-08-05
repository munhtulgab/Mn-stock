import type { IndexKey } from "@/lib/mse/indices";

/**
 * Current index levels from marketinfo.mn.
 *
 * The exchange's own site serves an index series that ends at the previous
 * session, so the headline cards would show yesterday's level all through
 * today's trading. This endpoint carries the running level instead.
 *
 * Field names read oddly: `indexUnit` is the current level and `indexChange`
 * is the previous close, which the feed's own `changeValue` confirms —
 * 54,530.96 less 54,831.44 is the -300.48 it reports.
 */

const ENDPOINT = "https://service.marketinfo.mn/mse/indexs";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12_000;
const CACHE_MS = 30_000;

/** The feed's display names, mapped to the keys the cards already use. */
const NAME_TO_KEY: Record<string, IndexKey> = {
  "TOP 20": "top20",
  "TOP-20": "top20",
  "MSE A": "mseA",
  "MSE B": "mseB",
};

export interface LiveIndex {
  key: IndexKey;
  /** Current level. */
  value: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  date: string | null;
}

interface RawIndex {
  name?: string;
  indexUnit?: number | null;
  indexChange?: number | null;
  changeValue?: number | null;
  changePercent?: string | number | null;
  high?: number | null;
  low?: number | null;
  today?: string | null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function parseIndices(payload: unknown): Map<IndexKey, LiveIndex> {
  const rows: RawIndex[] = Array.isArray(payload) ? (payload as RawIndex[]) : [];
  const result = new Map<IndexKey, LiveIndex>();

  for (const row of rows) {
    const key = row.name ? NAME_TO_KEY[row.name.trim()] : undefined;
    const value = num(row.indexUnit);
    if (!key || value === null) continue;

    const previousClose = num(row.indexChange);
    const change =
      num(row.changeValue) ??
      (previousClose !== null ? value - previousClose : null);

    result.set(key, {
      key,
      value,
      previousClose,
      change,
      changePct:
        num(row.changePercent) ??
        (previousClose !== null && previousClose > 0
          ? ((value - previousClose) / previousClose) * 100
          : null),
      high: num(row.high),
      low: num(row.low),
      date: row.today?.slice(0, 10) ?? null,
    });
  }
  return result;
}

let cache: { at: number; indices: Map<IndexKey, LiveIndex> } | null = null;
let inFlight: Promise<Map<IndexKey, LiveIndex>> | null = null;

/** Empty when unreachable, so callers keep whatever they already had. */
export async function fetchLiveIndices(): Promise<Map<IndexKey, LiveIndex>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.indices;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(ENDPOINT, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return cache?.indices ?? new Map();
      const indices = parseIndices(await res.json());
      if (indices.size > 0) cache = { at: Date.now(), indices };
      return indices.size > 0 ? indices : (cache?.indices ?? new Map());
    } catch {
      return cache?.indices ?? new Map();
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
