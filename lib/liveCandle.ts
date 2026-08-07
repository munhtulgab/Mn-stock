import type { LiveQuote } from "@/lib/marketinfo/quotes";
import type { Candle } from "@/lib/analysis/series";

/**
 * Today's bar, built from the running quote.
 *
 * The exchange publishes a session only once it has closed, so during
 * trading its newest stored close is yesterday's. Everything drawn or
 * computed from stored prices alone therefore stops a day short of the price
 * the page is quoting — the chart ends on Thursday while the header says
 * Friday, and the indicators describe a market that has since moved.
 *
 * This is the one place that turns a live quote into a bar, so the chart,
 * the technical scorecard, the risk figures and the dashboard's own
 * recommendation all extend their series the same way. Two versions of this
 * is how the chart and the header came to disagree in the first place.
 */

/** The bar a running quote describes, or null if it describes none. */
export function liveCandle(
  live: LiveQuote | null | undefined,
  priorClose: number | undefined,
): Candle | null {
  const date = live?.at?.slice(0, 10);
  if (!live || live.price === null || !date) return null;

  // Every field is filled rather than left undefined. A 52-week range is a
  // Math.max over a year of highs, and one undefined in that array makes the
  // whole figure NaN — which is how a running quote with no stated high
  // (most of them) could blank the range on a company's page.
  const open = live.open ?? priorClose ?? live.price;
  return {
    date,
    open,
    high: live.high ?? Math.max(live.price, open),
    low: live.low ?? Math.min(live.price, open),
    close: live.price,
    volume: live.volume ?? 0,
  };
}

/**
 * The series with today's bar on the end of it.
 *
 * Replaces the last bar when the exchange has already published the same
 * day, appends when it has not, and leaves the series alone when the quote
 * is older than what is stored — a stale quote must never rewrite history.
 */
export function withLiveCandle<T extends Candle>(
  candles: T[],
  live: LiveQuote | null | undefined,
): T[] {
  const lastStored = candles.at(-1);
  const bar = liveCandle(
    live,
    // What this bar replaces, if it replaces one: the close before today.
    lastStored?.date === live?.at?.slice(0, 10)
      ? candles.at(-2)?.close
      : lastStored?.close,
  );
  if (!bar) return candles;

  // Carried over so a caller with a richer row type keeps its own fields.
  const merged = { ...(lastStored ?? ({} as T)), ...bar } as T;

  if (lastStored?.date === bar.date) return [...candles.slice(0, -1), merged];
  if (!lastStored || lastStored.date < bar.date) return [...candles, merged];
  return candles;
}
