import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";
import { fetchExchangeMovers } from "@/lib/mse/movers";
import { fetchSecuritiesList } from "@/lib/mse/securities";
import { fetchTdbQuote, fetchTdbQuotes } from "@/lib/tdb/quotes";
import { ulaanbaatarDay, ulaanbaatarTime } from "@/lib/day";

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

/**
 * How long a quote is reused before the feed is asked again.
 *
 * Measured against the source: marketinfo republishes about every two
 * minutes — 10:38:57 then 10:40:58 — so most asks return what we already
 * have. Holding an answer for thirty seconds on top of that added our own
 * delay to theirs for no gain; five seconds keeps a burst of renders from
 * hammering the host while putting a new figure on screen within seconds of
 * it existing.
 */
const CACHE_MS = 5_000;

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
          // Never a stored copy: the whole point of this call is what
          // changed since the last one.
          cache: "no-store",
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

/**
 * What one security's own page will wait for its price.
 *
 * Longer than a list's budget because the price is what that page is for. A
 * list can show fifty dated closes and lose nothing; a company page that
 * gives up after three and a half seconds renders the last published close
 * as its headline figure and then has the reader watch it change when the
 * client's own poll — same feed, a second later, now warm — comes back with
 * the running price. That flip is the bug this budget exists to prevent, and
 * a second and a half more waiting is a far better trade than showing a
 * number that is about to be replaced.
 */
export const DETAIL_BUDGET_MS = 5_000;

/**
 * The exchange's own board, for when marketinfo is not answering.
 *
 * marketinfo.mn is the only live price this app has, and on the morning of
 * 10 August 2026 every one of its endpoints answered 503 — so the whole app
 * sat on Friday's closes through an open session, which is the fault this
 * stands against. mse.mn was up the whole time and publishing the day's
 * movers and index levels.
 *
 * It is a narrower feed and honestly so: the board is the ten risers and the
 * ten fallers, not the market. That is the set worth having, though — the
 * companies whose stale price a reader would notice are exactly the ones
 * that moved. Everything else keeps its last close, which is what it had
 * anyway.
 */

/** The exchange's symbol-to-code list. Codes do not churn; this rarely runs. */
const CODES_TTL_MS = 6 * 60 * 60 * 1000;
let codeCache: { at: number; codes: Map<string, number> } | null = null;

async function companyCodes(): Promise<Map<string, number>> {
  if (codeCache && Date.now() - codeCache.at < CODES_TTL_MS) return codeCache.codes;
  const list = await fetchSecuritiesList().catch(() => []);
  if (list.length === 0) return codeCache?.codes ?? new Map();
  const codes = new Map(list.map((s) => [s.symbol, s.companyCode]));
  codeCache = { at: Date.now(), codes };
  return codes;
}

/**
 * Whether the board is describing today.
 *
 * It carries no date of its own, so this is the one thing that has to be
 * inferred, and getting it wrong would stamp Friday's prices with Monday's
 * date — worse than showing a close and admitting it. Weekdays only, and
 * only from the open until well after the close, so a Sunday reader is never
 * handed the last session dressed as a live one.
 */
function boardIsAboutToday(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ulaanbaatar",
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const time = ulaanbaatarTime(now);
  return time >= "10:00" && time <= "17:00";
}

/** Exposed for the tests: the one judgement in this fallback worth pinning. */
export const __testing = { boardIsAboutToday };

/** Datalab's session, in the shape the rest of the app reads quotes in. */
function fromTdb(tdb: NonNullable<Awaited<ReturnType<typeof fetchTdbQuote>>>, at: string): LiveQuote {
  return {
    symbol: tdb.symbol,
    companyCode: tdb.companyCode,
    price: tdb.close,
    lastTrade: tdb.close,
    previousClose: tdb.previousClose,
    changePct: tdb.changePct,
    open: tdb.open,
    high: tdb.high,
    low: tdb.low,
    vwap: tdb.vwap,
    volume: tdb.volume,
    turnover: tdb.turnover,
    // Datalab states no trade count and no book.
    trades: null,
    bid: null,
    ask: null,
    at,
  };
}

/**
 * One company's session, for a page that found nothing in the live map.
 *
 * The movers board names twenty companies; the market is four hundred. APU
 * traded today at 969 against Friday's 965.74 and appears on no board,
 * because a third of a percent is not a mover — so a reader opening it while
 * marketinfo is down would have seen Friday. This asks Datalab about the one
 * company being looked at, which is a single request and only while the
 * primary feed is out.
 */
export async function fetchFallbackQuote(companyCode: number): Promise<LiveQuote | null> {
  const now = new Date();
  if (!boardIsAboutToday(now)) return null;
  const tdb = await fetchTdbQuote(companyCode).catch(() => null);
  return tdb ? fromTdb(tdb, `${ulaanbaatarDay(now)}T${ulaanbaatarTime(now)}`) : null;
}

async function exchangeQuotes(): Promise<Map<number, LiveQuote>> {
  const now = new Date();
  const out = new Map<number, LiveQuote>();
  if (!boardIsAboutToday(now)) return out;

  const [movers, codes] = await Promise.all([
    fetchExchangeMovers().catch(() => null),
    companyCodes(),
  ]);
  if (!movers) return out;

  const at = `${ulaanbaatarDay(now)}T${ulaanbaatarTime(now)}`;

  // The board says which companies traded and what they cost; Datalab says
  // what the session actually looked like — the open, the range, the volume.
  // Asked only about the companies the board named, because Datalab answers
  // one company per request and has no listing endpoint.
  const wanted = [...movers.gainers, ...movers.losers]
    .map((mover) => codes.get(mover.symbol))
    .filter((code): code is number => code !== undefined);
  const detailed = await fetchTdbQuotes(wanted).catch(
    () => new Map<number, Awaited<ReturnType<typeof fetchTdbQuote>>>(),
  );

  for (const mover of [...movers.gainers, ...movers.losers]) {
    const companyCode = codes.get(mover.symbol);
    if (companyCode === undefined || !Number.isFinite(mover.price)) continue;

    const tdb = detailed.get(companyCode);
    if (tdb) {
      out.set(companyCode, fromTdb(tdb, at));
      continue;
    }
    // The board states the move, not what it moved from; the close it implies
    // is exact arithmetic rather than a guess.
    const previousClose =
      typeof mover.changePct === "number" && mover.changePct !== -100
        ? mover.price / (1 + mover.changePct / 100)
        : null;
    out.set(companyCode, {
      symbol: mover.symbol,
      companyCode,
      price: mover.price,
      lastTrade: mover.price,
      previousClose,
      changePct: typeof mover.changePct === "number" ? mover.changePct : null,
      // The board publishes none of these. Left null rather than invented:
      // the candle builder opens a bar at yesterday's close and spans what it
      // knows when they are missing, which is the truth about this feed.
      open: null,
      high: null,
      low: null,
      vwap: null,
      volume: null,
      turnover: null,
      trades: null,
      bid: null,
      ask: null,
      at,
    });
  }
  return out;
}

export async function fetchLiveQuotes(
  options: { extraCaCerts?: string; budgetMs?: number } = {},
): Promise<Map<number, LiveQuote>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.quotes;
  if (inFlight) return inFlight;
  // Backing off is only sound while there is something to serve instead.
  // With no cached snapshot at all it guaranteed the opposite of what it was
  // for: one slow call, and every render for the next twenty seconds skipped
  // the feed entirely and published a stale close — several readers in a row
  // shown a price the very next poll would correct.
  if (cache && Date.now() - failedAt < FAILURE_BACKOFF_MS) return cache.quotes;

  inFlight = load(options.extraCaCerts, options.budgetMs ?? PAGE_BUDGET_MS)
    .then(async (quotes) => {
      // Keep the previous snapshot if this attempt came back empty.
      if (quotes.size > 0) {
        cache = { at: Date.now(), quotes };
        return quotes;
      }
      failedAt = Date.now();
      // Nothing from marketinfo. Before falling back on a stored close, ask
      // the exchange what its own board is showing — it was up and trading
      // on the day this was written and marketinfo was not.
      const fromExchange = await exchangeQuotes().catch(() => new Map<number, LiveQuote>());
      if (fromExchange.size > 0) {
        cache = { at: Date.now(), quotes: fromExchange };
        return fromExchange;
      }
      return cache?.quotes ?? new Map();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
