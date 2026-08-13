import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";

/**
 * The standing orders behind a price, level by level.
 *
 * The quote feed states totals — every buy order counted together — which
 * says how deep a side is and not where. This is the ladder itself: each
 * price with the shares queued at it, which is what decides whether an order
 * fills at the price on screen or walks up the book.
 *
 * Behind a login, unlike everything else this app reads. marketinfo answers
 * `WWW-Authenticate: Bearer` here, and the token its site carries is a Google
 * ID token for the signed-in reader — an hour long, no refresh this side of
 * their OAuth flow. So the book is an extra rather than a dependency: the
 * modal draws it where a working token is configured and does without where
 * one is not, and the totals from the quote feed remain the thing that is
 * always there.
 */

const BASE = "https://service.marketinfo.mn/mse/orders";
const TIMEOUT_MS = 8_000;

export interface OrderBookLevel {
  price: number;
  /** Shares standing at this price, summed across the orders at it. */
  size: number;
  /** How many separate orders make up that size. */
  orders: number;
}

export interface OrderBook {
  /** Buy orders, best first — the highest price anyone is bidding. */
  bids: OrderBookLevel[];
  /** Sell orders, best first — the lowest price anyone is offering. */
  asks: OrderBookLevel[];
}

/**
 * Which side a row belongs to, in the exchange's own numbering. These are
 * FIX's MDEntryType values, which the feed passes through as strings.
 */
const BID = "0";
const ASK = "1";

interface RawEntry {
  mdEntryType?: string | number | null;
  mdEntryPx?: number | null;
  mdEntrySize?: number | null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * One row per price rather than per order.
 *
 * The feed lists every order separately — АПУ's book carried five of them at
 * 980, sized 1, 31, 100, 10 and 8 — and a reader deciding whether their order
 * will fill wants the 150 standing there, not five rows that have to be added
 * up by eye. The count is kept so the depth can still be read as one large
 * order or many small ones.
 */
function collapse(entries: RawEntry[], side: string): OrderBookLevel[] {
  const levels = new Map<number, OrderBookLevel>();

  for (const entry of entries) {
    if (String(entry.mdEntryType ?? "") !== side) continue;
    const price = num(entry.mdEntryPx);
    const size = num(entry.mdEntrySize);
    if (price === null || price <= 0 || size === null || size <= 0) continue;

    const level = levels.get(price);
    if (level) {
      level.size += size;
      level.orders++;
    } else {
      levels.set(price, { price, size, orders: 1 });
    }
  }

  // Best first from either side: the highest bid and the lowest offer are
  // both the order that would fill next.
  return [...levels.values()].sort((a, b) =>
    side === BID ? b.price - a.price : a.price - b.price,
  );
}

/**
 * `bookSymbol` is the exchange's order-book code — "APU-O-0000" — and not the
 * ticker. Almost every listing is `-O-0000`, but not all of them, so it is
 * carried through from the quote feed rather than rebuilt from the ticker.
 */
export async function fetchOrderBook(
  bookSymbol: string,
  token: string,
): Promise<OrderBook | null> {
  const url = `${BASE}/${encodeURIComponent(bookSymbol)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    // The API is wired for its own site and answers CORS to it; sending the
    // origin it expects keeps this looking like what it serves.
    Origin: "https://marketinfo.mn",
    Referer: "https://marketinfo.mn/",
  };

  try {
    // The same two steps the quote feed takes. `service.marketinfo.mn` serves
    // a complete chain and ordinary fetch reaches it; the certificate-
    // recovering path is there for the day it stops doing so, as the main
    // site already has.
    let status: number;
    let body: string;
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      body = await res.text();
    } catch {
      const res = await fetchWithExtraCa(url, {
        extraCerts: parsePemBundle(""),
        headers,
        timeoutMs: TIMEOUT_MS,
      });
      status = res.status;
      body = res.body;
    }

    // 401 is the expected failure, not an exceptional one: the token these
    // are read with expires every hour.
    if (status !== 200) return null;

    const rows = JSON.parse(body) as unknown;
    if (!Array.isArray(rows)) return null;

    const entries = rows as RawEntry[];
    const book = { bids: collapse(entries, BID), asks: collapse(entries, ASK) };
    return book.bids.length === 0 && book.asks.length === 0 ? null : book;
  } catch {
    return null;
  }
}

export const __testing = { collapse, BID, ASK };
