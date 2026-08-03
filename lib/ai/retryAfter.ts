const RETRY_TAG_RE = /\s*\[retry_after_seconds=(\d+(?:\.\d+)?)\]/;

/** Appends a machine-parseable retry hint that humanizeProviderError reads
 * back out later — keeps the raw error text self-contained so no extra
 * plumbing is needed to carry the value alongside it. */
export function withRetryAfter(message: string, seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return message;
  return `${message} [retry_after_seconds=${Math.ceil(seconds)}]`;
}

export function extractRetryAfterSeconds(message: string): number | null {
  const match = message.match(RETRY_TAG_RE);
  return match ? Number(match[1]) : null;
}

export function stripRetryAfterTag(message: string): string {
  return message.replace(RETRY_TAG_RE, "").trim();
}

export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} секундын`;
  return `${Math.ceil(seconds / 60)} минутын`;
}
