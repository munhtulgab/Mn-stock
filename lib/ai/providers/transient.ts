/**
 * Failures that are about the minute rather than the request.
 *
 * A 503 from an inference provider means its fleet is busy, not that the
 * question was wrong — the same call a second later usually answers. The app
 * used to surface those straight to the reader, so one busy moment at Google
 * cost a whole analyst out of the panel of six and the reader was told to
 * press the button again themselves.
 *
 * A 429 is deliberately not here. That one carries the provider's own
 * `Retry-After`, which can be minutes, and burning the request budget waiting
 * it out helps nobody: it is reported with the wait attached instead.
 */
const TRANSIENT_STATUSES = new Set([408, 500, 502, 503, 504]);

export function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUSES.has(status);
}

/**
 * How many further attempts a transient failure is worth.
 *
 * Two. A busy fleet comes back within a second or clears in a minute, and the
 * second case is not something a page render can wait for.
 */
export const TRANSIENT_RETRIES = 2;

/**
 * Kept short on purpose. These failures return immediately — nothing was
 * queued — so the wait is the whole cost, and the call itself still has to
 * fit inside the request that is holding the page.
 *
 * The first two steps are what they always were. The ladder past them is for
 * a provider given more than two tries — Z.AI's free flash model turns
 * requests away often enough that two is not a fair test of it — and it
 * lengthens rather than repeating 1,500ms, because a busy minute that has
 * already survived three seconds is not going to clear in another 1.5.
 */
const BACKOFF_MS = [500, 1500, 3000, 5000, 7000];

export function retryDelayMs(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
