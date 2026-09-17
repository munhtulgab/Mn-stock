import * as cheerio from "cheerio";
import { fetchMseHtml } from "./client";
import { ulaanbaatarDay, ulaanbaatarTime } from "@/lib/day";
import type { LiveQuote } from "@/lib/marketinfo/quotes";

/**
 * The price the exchange prints at the top of a security's own page.
 *
 * Every other price this app can reach has a gap this one does not. The live
 * book comes from marketinfo, which carries the forty-odd securities that
 * traded in a session and none of the funds — FTI is not in its feed at all.
 * Datalab knows the funds but is only asked between ten and five, because
 * its figure carries no date and outside a session would be a stale close
 * dressed as a live one. What is left is the stored history, scraped from
 * this same page's trading table — and the exchange publishes a session to
 * that table only after it has been through clearing.
 *
 * For FTI that ran a full day behind: the fund's own page read 1,019₮ all
 * evening while the newest row in its table was the previous session's
 * 1,022₮, so the app quoted yesterday to a reader looking at today.
 *
 * The heading is the same page read at the top instead of in the table, and
 * it is current. What it does not carry is a date — see
 * {@link fetchExchangeQuote} for what that costs and how it is paid.
 */
export interface ExchangeQuote {
  /** The exchange's current price for the security. */
  price: number;
  /** Move from the previous close, as the page states it. */
  change: number;
  changePct: number;
  /** Derived, not printed: the close this session is measured against. */
  previousClose: number;
}

/** "1019₮", "59500₮" — the heading prints a bare number and the currency. */
function toNumber(text: string): number | null {
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads `<h3>1019₮</h3>` and `<h6>-3 (-0.29%)</h6>` out of the page head.
 *
 * A security that has never traded heads its page with `0₮` and `0 (0%)`.
 * That is the absence of a price rather than a price of zero, so it is
 * refused here rather than left for every caller to remember.
 */
export function parseHeadingQuote(html: string): ExchangeQuote | null {
  const $ = cheerio.load(html);
  const heading = $(".pages-heading-right").first();
  if (heading.length === 0) return null;

  const price = toNumber(heading.find("h3").first().text());
  if (price === null || price <= 0) return null;

  // "-3 (-0.29%)": the move, then the same move as a percentage. A gain is
  // printed without a sign — "15 (0.3%)" — so the colour class carries what
  // the number does not, and neither is needed: the sign is on the loss.
  const move = heading.find("h6").first().text();
  const change = toNumber(move);
  const pct = toNumber(move.slice(move.indexOf("(") + 1));
  if (change === null || pct === null) return null;

  return { price, change, changePct: pct, previousClose: price - change };
}

/**
 * One read per security per minute, however many readers are watching.
 *
 * The page is a quarter of a megabyte and the client re-asks for the price
 * every minute while a session is shut. Cached for as long as that poll, so
 * a company with readers on it costs the exchange one request a minute
 * rather than one per reader.
 */
const CACHE_MS = 60_000;
const cache = new Map<number, { at: number; quote: ExchangeQuote | null }>();

export async function fetchSecurityQuote(
  companyCode: number,
): Promise<ExchangeQuote | null> {
  const hit = cache.get(companyCode);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;

  const quote = parseHeadingQuote(await fetchMseHtml(`/securities/${companyCode}`));
  cache.set(companyCode, { at: Date.now(), quote });
  return quote;
}

/** Mongolia's exchange trades Monday to Friday. */
function isWeekday(now: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ulaanbaatar",
    weekday: "short",
  }).format(now);
  return weekday !== "Sat" && weekday !== "Sun";
}

/**
 * Whether the heading is a session the stored history does not have.
 *
 * The heading states no date, so one has to be established rather than
 * assumed — and the page states enough to do it. The move it prints makes
 * the previous close `price - change`; when that equals the newest close on
 * file, this quote is the session immediately after it. The exchange has one
 * session in hand that it has not published to the trading table, and an
 * unpublished session can only be the one trading now or the one that just
 * closed. Today, in other words, which is what it is stamped with.
 *
 * Hence the conditions. Where the previous close does not line up, the
 * relationship between this figure and the stored history is unknown and it
 * is left alone. Where the two prices are equal the history already has it.
 * And where today is a weekend nothing has traded since Friday, so an
 * unpublished session would be Friday's and stamping it Saturday would put
 * the wrong day under the price. Each case keeps the stored close, which is
 * dated and honest about being a close.
 */
export function headingIsNewer(
  quote: ExchangeQuote | null,
  newestStoredClose: number | null,
  now: Date,
): quote is ExchangeQuote {
  if (!quote || newestStoredClose === null || !isWeekday(now)) return false;
  return (
    quote.previousClose === newestStoredClose && quote.price !== newestStoredClose
  );
}

/**
 * The heading quote in the shape the rest of the app reads quotes in, and
 * only when {@link headingIsNewer} says it is worth reading.
 *
 * Deliberately not called during a session in place of the live feed: it is
 * a page load per security and states neither book nor volume, so it fills
 * the gap the other sources leave rather than standing in front of them.
 */
export async function fetchExchangeQuote(
  symbol: string,
  companyCode: number,
  newestStoredClose: number | null,
  now = new Date(),
): Promise<LiveQuote | null> {
  if (newestStoredClose === null || !isWeekday(now)) return null;

  const quote = await fetchSecurityQuote(companyCode);
  if (!headingIsNewer(quote, newestStoredClose, now)) return null;

  return {
    symbol,
    companyCode,
    price: quote.price,
    // The heading prints one number and it is the session's price. Which
    // trade it was is not stated, so nothing here pretends to know.
    lastTrade: null,
    previousClose: quote.previousClose,
    changePct: quote.changePct,
    open: null,
    high: null,
    low: null,
    vwap: null,
    volume: null,
    turnover: null,
    trades: null,
    bid: null,
    ask: null,
    bidQty: null,
    askQty: null,
    bidVwap: null,
    askVwap: null,
    bookSymbol: null,
    at: `${ulaanbaatarDay(now)}T${ulaanbaatarTime(now)}`,
  };
}
