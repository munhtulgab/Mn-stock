import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";

/**
 * Intraday quotes from marketinfo.mn.
 *
 * The exchange's own open-data portal publishes a session only after it
 * closes, so during trading hours its newest figure is the previous day's.
 * marketinfo carries the live book instead — last trade, best bid and offer,
 * running volume and turnover, each stamped with the time of the entry.
 *
 * Rows are keyed by `companycode`, which is the MSE company code this app
 * already stores, so no symbol mapping is needed. The symbol field carries a
 * board suffix ("APU-O-0000") that is trimmed for display.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12_000;

/** Quotes move constantly; this bounds how often the upstream is asked. */
const CACHE_MS = 30_000;

/**
 * The site reads everything through one base URL, with exchange data under
 * an `mse/` prefix — visible in a browser console as a CORS complaint about
 * `service.marketinfo.mn/mse/indexs`. The alternatives are kept behind it in
 * case the prefix moves.
 */
export const QUOTE_ENDPOINTS = [
  "https://service.marketinfo.mn/mse/trades",
  "https://api.marketinfo.mn/mse/trades",
  "https://api.marketinfo.mn/trades",
];

/** Whether the exchange is currently in session, per the same API. */
export const STATUS_ENDPOINT = "https://service.marketinfo.mn/mse/status";

/** Overrides the built-in list once the working address is known. */
const CONFIGURED = process.env.MARKETINFO_QUOTES_URL;
const ENDPOINTS = CONFIGURED ? [CONFIGURED, ...QUOTE_ENDPOINTS] : QUOTE_ENDPOINTS;

export interface LiveQuote {
  symbol: string;
  companyCode: number;
  /**
   * The exchange's price for the security — its `closingPrice`, which during
   * an open session is the running close rather than a final one. Checked
   * against the feed's own `changes` field across a full session snapshot:
   * it reconciles on all 16 rows, while the last trade reconciles on none of
   * the 9 where the two differ. A stock can trade away from the close on a
   * single small order, so the last trade is carried separately.
   */
  price: number | null;
  /** Price of the most recent individual trade. */
  lastTrade: number | null;
  previousClose: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  vwap: number | null;
  volume: number | null;
  turnover: number | null;
  trades: number | null;
  bid: number | null;
  ask: number | null;
  /** Exchange timestamp of the entry, e.g. 2026-08-05T12:58:19+08:00. */
  at: string | null;
}

interface RawQuote {
  symbol?: string;
  companycode?: number;
  lastTradedPrice?: number | null;
  closingPrice?: number | null;
  previousClose?: number | null;
  changesPercent?: string | number | null;
  openingPrice?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  vwap?: number | null;
  volume?: number | null;
  turnover?: number | null;
  trades?: number | null;
  highestBidPrice?: number | null;
  lowestOfferPrice?: number | null;
  mdEntryTime?: string | null;
  securityType?: string | null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** "APU-O-0000" is the order-book code; the ticker is the part before it. */
function bareSymbol(raw: string): string {
  return raw.split("-")[0].trim().toUpperCase();
}

export function parseQuotes(payload: unknown): Map<number, LiveQuote> {
  const rows: RawQuote[] = Array.isArray(payload)
    ? (payload as RawQuote[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: RawQuote[] }).data)
      : [];

  const quotes = new Map<number, LiveQuote>();
  for (const row of rows) {
    const companyCode = num(row.companycode);
    if (companyCode === null || !row.symbol) continue;

    const price = num(row.closingPrice) ?? num(row.lastTradedPrice);
    const previousClose = num(row.previousClose);
    // The feed states a percentage; derive one only when it doesn't.
    const stated = num(row.changesPercent);
    const changePct =
      stated ??
      (price !== null && previousClose !== null && previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : null);

    quotes.set(companyCode, {
      symbol: bareSymbol(row.symbol),
      companyCode,
      price,
      lastTrade: num(row.lastTradedPrice),
      previousClose,
      changePct,
      open: num(row.openingPrice),
      high: num(row.highPrice),
      low: num(row.lowPrice),
      vwap: num(row.vwap),
      volume: num(row.volume),
      turnover: num(row.turnover),
      trades: num(row.trades),
      bid: num(row.highestBidPrice),
      ask: num(row.lowestOfferPrice),
      at: row.mdEntryTime ?? null,
    });
  }
  return quotes;
}

/**
 * Whether the exchange is in session, as the exchange itself reports it.
 * Guessing from the clock would be wrong on holidays and half-days.
 */
export async function fetchMarketOpen(): Promise<boolean | null> {
  if (statusCache && Date.now() - statusCache.at < CACHE_MS) {
    return statusCache.open;
  }
  try {
    const res = await fetch(STATUS_ENDPOINT, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return statusCache?.open ?? null;
    const body = (await res.json()) as { status?: string };
    // Reported in Mongolian: "Зах зээл хаалттай" when shut.
    const open = typeof body.status === "string" && !/хаалттай/i.test(body.status);
    statusCache = { at: Date.now(), open };
    return open;
  } catch {
    return statusCache?.open ?? null;
  }
}

let statusCache: { at: number; open: boolean } | null = null;
let cache: { at: number; quotes: Map<number, LiveQuote> } | null = null;
let inFlight: Promise<Map<number, LiveQuote>> | null = null;

async function load(extraCaCerts?: string): Promise<Map<number, LiveQuote>> {
  const extraCerts = extraCaCerts ? parsePemBundle(extraCaCerts) : [];
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

  for (const endpoint of ENDPOINTS) {
    try {
      let body: string;
      let ok: boolean;
      try {
        const res = await fetch(endpoint, {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        body = await res.text();
        ok = res.ok;
      } catch {
        // marketinfo omits its intermediate certificate; the retry recovers it.
        const res = await fetchWithExtraCa(endpoint, {
          extraCerts,
          headers,
          timeoutMs: TIMEOUT_MS,
        });
        body = res.body;
        ok = res.status >= 200 && res.status < 300;
      }
      if (!ok) continue;

      const quotes = parseQuotes(JSON.parse(body));
      if (quotes.size > 0) return quotes;
    } catch {
      // Try the next host rather than failing the whole lookup.
    }
  }
  return new Map();
}

/**
 * Every security quoted in the current session, keyed by MSE company code.
 * Empty when marketinfo is unreachable — callers fall back to stored closes.
 */
export async function fetchLiveQuotes(
  options: { extraCaCerts?: string } = {},
): Promise<Map<number, LiveQuote>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quotes;
  if (inFlight) return inFlight;

  inFlight = load(options.extraCaCerts)
    .then((quotes) => {
      // Keep the previous snapshot if this attempt came back empty.
      if (quotes.size > 0) cache = { at: Date.now(), quotes };
      return quotes.size > 0 ? quotes : (cache?.quotes ?? new Map());
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
