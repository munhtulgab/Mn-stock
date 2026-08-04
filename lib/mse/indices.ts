/**
 * MSE index series (TOP-20, MSE-A, MSE-B).
 *
 * mse.mn is a Next.js app that loads its index history through a server
 * action rather than a public REST endpoint, so we call that action the same
 * way the site's own browser code does. The action id is a build hash and
 * changes whenever MSE redeploys, so a stale id is expected rather than
 * exceptional — `discoverActionId` re-reads it out of the site's JS bundles
 * when the pinned one stops working.
 */

const SITE_URL = "https://www.mse.mn";
const USER_AGENT =
  "Mozilla/5.0 (compatible; MseRateAdvisor/1.0; +https://mse.mn)";

/** Last known-good action id for the site's generic data fetcher. */
const PINNED_ACTION_ID = "6d867ebd99fb6edef2f9537b22668cd0c00a71c2";

export type IndexKey = "top20" | "mseA" | "mseB";

export const INDEX_KEYS: { key: IndexKey; action: string; label: string }[] = [
  { key: "top20", action: "top20Data", label: "TOP-20" },
  { key: "mseA", action: "mseAData", label: "MSE-A" },
  { key: "mseB", action: "mseBData", label: "MSE-B" },
];

export interface IndexPoint {
  date: string; // YYYY-MM-DD
  value: number;
  high: number;
  low: number;
}

function isIndexPointArray(value: unknown): value is IndexPoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof (value[0] as IndexPoint)?.date === "string" &&
    typeof (value[0] as IndexPoint)?.value === "number"
  );
}

/**
 * A server action reply is an RSC payload: `<id>:<json>` per line. We want the
 * one row that carries the series, so try each line and keep the first that
 * looks like index points.
 */
function parseActionPayload(text: string): IndexPoint[] | null {
  for (const line of text.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(sep + 1));
      if (isIndexPointArray(parsed)) return parsed;
    } catch {
      // Not every row is JSON (the payload also carries refs and markers).
    }
  }
  return null;
}

async function callDataAction(
  action: string,
  actionId: string,
): Promise<IndexPoint[] | null> {
  const res = await fetch(SITE_URL, {
    method: "POST",
    headers: {
      "Next-Action": actionId,
      "Content-Type": "application/json",
      Accept: "text/x-component",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify([
      { url: action, parameter: "?lang=mn", config: { hasToken: false } },
    ]),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parseActionPayload(await res.text());
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
  }).then((r) => (r.ok ? r.text() : ""));

  const chunks = [
    ...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g),
  ].map((m) => m[1]);

  for (const chunk of chunks) {
    const js = await fetch(`${SITE_URL}${chunk}`, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
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
 * Full daily history for the three headline indices, oldest point first.
 * Indices that fail to load are omitted rather than failing the whole fetch —
 * two out of three cards still beats none.
 */
export async function fetchIndexSeries(): Promise<Record<string, IndexPoint[]>> {
  let actionId = PINNED_ACTION_ID;

  const probe = await callDataAction(INDEX_KEYS[0].action, actionId).catch(
    () => null,
  );
  if (!probe) {
    const discovered = await discoverActionId().catch(() => null);
    if (!discovered) {
      throw new Error("MSE index action id could not be resolved");
    }
    actionId = discovered;
  }

  const series: Record<string, IndexPoint[]> = {};
  if (probe) series[INDEX_KEYS[0].key] = probe;

  const pending = INDEX_KEYS.filter(({ key }) => !series[key]);
  const results = await Promise.all(
    pending.map(({ action }) =>
      callDataAction(action, actionId).catch(() => null),
    ),
  );
  pending.forEach(({ key }, i) => {
    const points = results[i];
    if (points) series[key] = points;
  });

  if (Object.keys(series).length === 0) {
    throw new Error("MSE returned no index series");
  }
  return series;
}
