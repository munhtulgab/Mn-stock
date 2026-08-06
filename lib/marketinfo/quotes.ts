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

/**
 * The whole lookup, across every candidate endpoint and the certificate
 * retry each one may need. Without it a slow host multiplies: three
 * addresses at twelve seconds apiece is over half a minute of a page render
 * spent waiting, which is what made tapping a tab feel like a freeze.
 */
const TOTAL_BUDGET_MS = 9_000;

/** Quotes move constantly; this bounds how often the upstream is asked. */
const CACHE_MS = 30_000;

/**
 * The site reads everything through one base URL, with exchange data under
 * an `mse/` prefix — visible in a browser console as a CORS complaint about
 * `service.marketinfo.mn/mse/indexs`. The alternatives are kept behind it in
 * case the prefix moves.
 */
const QUOTE_ENDPOINTS = [
  "https://service.marketinfo.mn/mse/trades",
  "https://api.marketinfo.mn/mse/trades",
  "https://api.marketinfo.mn/trades",
];

/** Whether the exchange is currently in session, per the same API. */
const STATUS_ENDPOINT = "https://service.marketinfo.mn/mse/status";

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

/**
 * Zero is not a price on this feed, it is a blank.
 *
 * `closingPrice` is only set when the exchange closes the day, so during a
 * session every row carries 0 there — all 38 of them, at the moment this was
 * written — and a security with no order on one side carries 0 for that side
 * of the book. Read as a number, that 0 became the price on screen.
 */
function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

/** "APU-O-0000" is the order-book code; the ticker is the part before it. */
function bareSymbol(raw: string): string {
  return raw.split("-")[0].trim().toUpperCase();
}

function parseQuotes(payload: unknown): Map<number, LiveQuote> {
  const rows: RawQuote[] = Array.isArray(payload)
    ? (payload as RawQuote[])
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: RawQuote[] }).data)
      : [];

  const quotes = new Map<number, LiveQuote>();
  for (const row of rows) {
    const companyCode = num(row.companycode);
    if (companyCode === null || !row.symbol) continue;

    // The day's close if the day is closed; otherwise what it last traded
    // at; otherwise where it closed yesterday. A price is never nothing.
    const price =
      positive(row.closingPrice) ??
      positive(row.lastTradedPrice) ??
      positive(row.previousClose);
    const previousClose = positive(row.previousClose);
    const derived =
      price !== null && previousClose !== null
        ? ((price - previousClose) / previousClose) * 100
        : null;
    // The feed states a percentage, but states 0 for a session whose close
    // it has not set yet — which is every session while it is running.
    const stated = num(row.changesPercent);
    const changePct = stated !== null && stated !== 0 ? stated : (derived ?? stated);

    quotes.set(companyCode, {
      symbol: bareSymbol(row.symbol),
      companyCode,
      price,
      lastTrade: positive(row.lastTradedPrice),
      previousClose,
      changePct,
      open: positive(row.openingPrice),
      high: positive(row.highPrice),
      low: positive(row.lowPrice),
      vwap: positive(row.vwap),
      volume: num(row.volume),
      turnover: num(row.turnover),
      trades: num(row.trades),
      // The book's top of each side: 0 means nobody is offering there.
      bid: positive(row.highestBidPrice),
      ask: positive(row.lowestOfferPrice),
      at: row.mdEntryTime ?? null,
    });
  }
  return quotes;
}

/**
 * When the session's data stopped moving, across the whole market.
 *
 * Each row's `mdEntryTime` is when *that* security last updated, so QPAY
 * reads 12:57 and SUU 12:59 for the same closed session — labelling a
 * closing price with it makes every stock look like it closed at a
 * different moment. The market-wide latest entry is the session's end:
 * today it is 12:59:53, against a first entry of 10:00:03.
 *
 * Rounded up to the minute, so that 12:59:53 reads as the 13:00 close
 * rather than a minute short of it.
 */
export function sessionEnd(quotes: Map<number, LiveQuote>): string | null {
  let latest: string | null = null;
  for (const quote of quotes.values()) {
    if (quote.at && (!latest || quote.at > latest)) latest = quote.at;
  }
  if (!latest) return null;

  const [hh, mm, ss] = latest.slice(11, 19).split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return latest.slice(11, 16);
  const minutes = hh * 60 + mm + (ss > 0 ? 1 : 0);
  const rounded = minutes % (24 * 60);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(
    rounded % 60,
  ).padStart(2, "0")}`;
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

/**
 * When the feed is unreachable, how long before it is worth another go.
 *
 * A failed attempt used to leave nothing behind, so the next caller paid the
 * whole budget again — and a single page render asks more than once. With
 * marketinfo down that turned a three-second timeout into ten seconds of
 * page. A failure is an answer too, and worth remembering briefly.
 */
const FAILURE_BACKOFF_MS = 20_000;
let failedAt = 0;

async function load(
  extraCaCerts?: string,
  budgetMs = TOTAL_BUDGET_MS,
): Promise<Map<number, LiveQuote>> {
  const extraCerts = extraCaCerts ? parsePemBundle(extraCaCerts) : [];
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  const deadline = Date.now() + budgetMs;

  for (const endpoint of ENDPOINTS) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const timeout = Math.min(TIMEOUT_MS, left);
    try {
      let body: string;
      let ok: boolean;
      try {
        const res = await fetch(endpoint, {
          headers,
          signal: AbortSignal.timeout(timeout),
        });
        body = await res.text();
        ok = res.ok;
      } catch {
        // marketinfo omits its intermediate certificate; the retry recovers it.
        const res = await fetchWithExtraCa(endpoint, {
          extraCerts,
          headers,
          timeoutMs: Math.max(1_000, deadline - Date.now()),
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
/**
 * How long a page will wait for the running price before going with the
 * stored close. Nine seconds is a reasonable budget for a background job
 * walking several hosts; it is not a reasonable amount of time to hold a
 * page that already has a price to show, dated, from the exchange itself.
 */
const PAGE_BUDGET_MS = 3_500;

export async function fetchLiveQuotes(
  options: { extraCaCerts?: string; budgetMs?: number } = {},
): Promise<Map<number, LiveQuote>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quotes;
  if (inFlight) return inFlight;
  if (Date.now() - failedAt < FAILURE_BACKOFF_MS) return cache?.quotes ?? new Map();

  inFlight = load(options.extraCaCerts, options.budgetMs ?? PAGE_BUDGET_MS)
    .then((quotes) => {
      // Keep the previous snapshot if this attempt came back empty.
      if (quotes.size > 0) cache = { at: Date.now(), quotes };
      else failedAt = Date.now();
      return quotes.size > 0 ? quotes : (cache?.quotes ?? new Map());
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
