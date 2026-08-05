import type { PricePoint } from "@/lib/types";

/**
 * What a price is compared against, and how far it moved.
 *
 * On MSE most listings trade rarely — of 423 securities roughly 50 change
 * hands on a given day, and some have not traded since 2006. Stored prices
 * therefore have one row per *traded* session, not per calendar day, so
 * "the row before this one" can be a year earlier. Comparing the two and
 * calling the result a daily change produced +308% for a 2006 price and put
 * it at the top of the gainers list.
 *
 * The exchange publishes the figure each session was measured against, so
 * that is what these use.
 */

/** Calendar distance in days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * How close the neighbouring stored row must be to stand in as the previous
 * session. A weekend plus a public holiday fits; a dormant year does not.
 */
const ADJACENT_SESSION_DAYS = 7;

/**
 * The close a session's move is measured against: the exchange's own
 * PreviousClose, or the row before it when that row is recent enough to be
 * the session before. Null when neither applies — an unknowable change is
 * better shown as "—" than invented.
 */
export function priorClose(
  last: PricePoint | null,
  prev: PricePoint | null,
): number | null {
  if (!last) return null;
  if (last.previousClose > 0) return last.previousClose;
  if (prev && prev.close > 0 && daysBetween(prev.date, last.date) <= ADJACENT_SESSION_DAYS) {
    return prev.close;
  }
  return null;
}

/** A session's change in percent, against {@link priorClose}. */
export function sessionChangePct(
  last: PricePoint | null,
  prev: PricePoint | null,
): number | null {
  const base = priorClose(last, prev);
  if (!last || !(last.close > 0) || base === null || !(base > 0)) return null;
  return ((last.close - base) / base) * 100;
}
