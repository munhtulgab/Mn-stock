import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";
import { QUOTE_ENDPOINTS, parseQuotes } from "@/lib/marketinfo/quotes";

export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Reports what each candidate quote endpoint actually returns.
 *
 * The live-quote host cannot be reached from a development machine, so when
 * the page falls back to a stored close there is no way to tell a wrong URL
 * from an unreachable one. This says which it is, from the deployment that
 * does have the network path.
 *
 * Accepts `?url=` to try an address that isn't in the built-in list.
 */
export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings(db);
  const extraCerts = settings.extraCaCerts
    ? parsePemBundle(settings.extraCaCerts)
    : [];
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

  const extra = req.nextUrl.searchParams.get("url");
  const candidates = extra ? [extra, ...QUOTE_ENDPOINTS] : [...QUOTE_ENDPOINTS];

  const results = await Promise.all(
    candidates.map(async (endpoint) => {
      const started = Date.now();
      try {
        let status: number;
        let body: string;
        let via = "fetch";
        try {
          const res = await fetch(endpoint, {
            headers,
            signal: AbortSignal.timeout(15_000),
          });
          status = res.status;
          body = await res.text();
        } catch {
          const res = await fetchWithExtraCa(endpoint, {
            extraCerts,
            headers,
            timeoutMs: 15_000,
          });
          status = res.status;
          body = res.body;
          via = "chain-recovery";
        }

        let quotes = 0;
        let sample: unknown = null;
        try {
          const parsed = parseQuotes(JSON.parse(body));
          quotes = parsed.size;
          sample = parsed.values().next().value ?? null;
        } catch {
          // Not JSON, or not the shape we expect — the preview shows why.
        }

        return {
          endpoint,
          status,
          via,
          ms: Date.now() - started,
          bytes: body.length,
          quotes,
          sample,
          preview: quotes > 0 ? undefined : body.slice(0, 200),
        };
      } catch (err) {
        return {
          endpoint,
          error: (err as Error).message,
          ms: Date.now() - started,
        };
      }
    }),
  );

  return NextResponse.json({ results });
}
