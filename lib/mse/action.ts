/**
 * Calling mse.mn's data fetcher.
 *
 * The site is a Next.js app whose data comes from one server action rather
 * than a public REST endpoint, so we invoke it the way the site's own browser
 * code does: POST to the origin with a `Next-Action` header and the fetcher's
 * arguments as the body. The action id is a build hash and changes whenever
 * MSE redeploys, so a stale id is expected rather than exceptional and is
 * re-read out of the site's JS bundles when it stops working.
 */

const SITE_URL = "https://www.mse.mn";
const USER_AGENT = "Mozilla/5.0 (compatible; MseRateAdvisor/1.0; +https://mse.mn)";
const TIMEOUT_MS = 15_000;

/** Last known-good action id for the site's generic data fetcher. */
const PINNED_ACTION_ID = "6d867ebd99fb6edef2f9537b22668cd0c00a71c2";

/** Resolved id, kept for the life of the process once discovery has run. */
let currentActionId: string | null = null;

/**
 * A server action reply is an RSC payload: `<id>:<json>` per line. The rows
 * are a mix of refs, markers and the payload itself, so every line is tried
 * and the caller decides which shape it wanted.
 */
export function parseActionPayload<T>(
  text: string,
  matches: (value: unknown) => value is T,
): T | null {
  for (const line of text.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(sep + 1));
      if (matches(parsed)) return parsed;
    } catch {
      // Not every row is JSON.
    }
  }
  return null;
}

async function post(action: string, parameter: string, actionId: string): Promise<string | null> {
  const res = await fetch(SITE_URL, {
    method: "POST",
    headers: {
      "Next-Action": actionId,
      "Content-Type": "application/json",
      Accept: "text/x-component",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify([
      { url: action, parameter, config: { hasToken: false } },
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? res.text() : null;
}

/**
 * Reads the current action id out of mse.mn's client bundles. The fetcher is
 * exported as `lO` from a shared chunk, bound to a `createServerReference`
 * call that carries the id we need.
 */
async function discoverActionId(): Promise<string | null> {
  const html = await fetch(SITE_URL, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).then((r) => (r.ok ? r.text() : ""));

  const chunks = [
    ...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g),
  ].map((m) => m[1]);

  for (const chunk of chunks) {
    const js = await fetch(`${SITE_URL}${chunk}`, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");

    const exportMatch = js.match(/lO:\s*function\(\)\s*\{\s*return (\w+)\s*\}/);
    if (!exportMatch) continue;

    const idMatch = js.match(
      new RegExp(
        `\\b${exportMatch[1]}\\s*=\\s*\\(0,\\s*\\w+\\.\\$\\)\\("([0-9a-f]{40})"\\)`,
      ),
    );
    if (idMatch) return idMatch[1];
  }
  return null;
}

/**
 * Calls the fetcher, rediscovering the action id once if the pinned one has
 * gone stale. `matches` decides which row of the reply was the answer, so a
 * caller that gets nothing back cannot mistake a marker row for data.
 */
export async function callMseAction<T>(
  action: string,
  parameter: string,
  matches: (value: unknown) => value is T,
): Promise<T | null> {
  const attempt = async (id: string) => {
    const text = await post(action, parameter, id).catch(() => null);
    return text ? parseActionPayload(text, matches) : null;
  };

  const first = await attempt(currentActionId ?? PINNED_ACTION_ID);
  if (first) return first;

  const discovered = await discoverActionId().catch(() => null);
  if (!discovered) return null;
  currentActionId = discovered;
  return attempt(discovered);
}
