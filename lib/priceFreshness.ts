/**
 * When the exchange should be asked for a company's prices again.
 *
 * Pulled out of the fetch it guards and given no dependencies, because this
 * is the rule that decides whether a reader sees today's price or a stale
 * one, and a rule that important should be checkable without a database, a
 * network or a clock.
 *
 * It has been got wrong twice. Both times the mistake was the same shape:
 * the test for "are these prices current?" was answered using something
 * derived from the prices themselves — the newest date in a cached snapshot
 * built out of stored closes — so a stale store proved itself current and
 * the fetch never happened. The comparison here is against the calendar,
 * which cannot be talked round.
 */

/** How long a company is left alone after the exchange has been asked. */
export const PRICE_ATTEMPT_TTL_MS = 5 * 60 * 1000;

export function needsPriceRefresh({
  newestStored,
  today,
  lastAttemptAt,
  now,
}: {
  /** Newest date stored for this company, `YYYY-MM-DD`, or null if none. */
  newestStored: string | null;
  /** Today in Ulaanbaatar, `YYYY-MM-DD`. */
  today: string;
  /** When the exchange was last asked about this company. */
  lastAttemptAt: Date | undefined;
  now: number;
}): boolean {
  // Today's close is stored; there is nothing newer in existence.
  if (newestStored === today) return false;

  // A stored date in the future is not a reason to keep asking — it means a
  // clock somewhere disagrees, and re-fetching will not settle it.
  if (newestStored !== null && newestStored > today) return false;

  // Asked recently. Most of this market does not trade on a given day, so
  // this is the ordinary answer for most companies most of the time.
  const since = now - (lastAttemptAt?.getTime() ?? 0);
  if (since <= PRICE_ATTEMPT_TTL_MS) return false;

  return true;
}
