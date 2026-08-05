import * as cheerio from "cheerio";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";
import { extractNextPayloadText } from "@/lib/mse/nextPayload";

export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Structural summary of a page, for working out why a source yields nothing.
 *
 * A site that fails only from certain networks cannot be examined from a
 * development machine, so this reports the shape of what the deployment
 * actually receives: how much text is in the markup, whether a framework
 * payload is carried, and which data endpoints the page's widgets call.
 * Read-only, and returns no credentials.
 */
export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = req.nextUrl.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json(
      { error: "?url= параметрт http(s) хаяг өгнө үү" },
      { status: 400 },
    );
  }

  const settings = await getSettings(db);
  const extraCerts = settings.extraCaCerts
    ? parsePemBundle(settings.extraCaCerts)
    : [];
  const headers = { "User-Agent": USER_AGENT, Accept: "text/html,*/*" };

  let status = 0;
  let finalUrl = target;
  let body = "";
  let contentType = "";
  try {
    const res = await fetch(target, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    status = res.status;
    finalUrl = res.url;
    contentType = res.headers.get("content-type") ?? "";
    body = await res.text();
  } catch (err) {
    try {
      const res = await fetchWithExtraCa(target, { extraCerts, headers });
      status = res.status;
      finalUrl = res.finalUrl;
      contentType = res.contentType ?? "";
      body = res.body;
    } catch (retryErr) {
      return NextResponse.json({
        url: target,
        error: (retryErr as Error).message,
        firstError: (err as Error).message,
      });
    }
  }

  const $ = cheerio.load(body);
  const scripts = $("script[src]")
    .map((_, el) => $(el).attr("src"))
    .get()
    .slice(0, 15);
  // Kendo/jQuery widgets declare where they read their data.
  const dataUrls = [...body.matchAll(/url\s*:\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 25);
  const anchors = $("a")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length >= 25);

  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  // Try the endpoints the widgets name, so one report carries both where the
  // data comes from and what it looks like — otherwise finding the endpoint
  // and learning its shape would take two round trips.
  const origin = new URL(finalUrl).origin;
  const probes = await Promise.all(
    dataUrls
      .filter((u) => u.startsWith("/") || u.startsWith(origin))
      .slice(0, 8)
      .map(async (path) => {
        const endpoint = path.startsWith("/") ? `${origin}${path}` : path;
        for (const method of ["POST", "GET"] as const) {
          try {
            const res = await fetch(endpoint, {
              method,
              headers: {
                ...headers,
                "X-Requested-With": "XMLHttpRequest",
                ...(method === "POST"
                  ? { "Content-Type": "application/x-www-form-urlencoded" }
                  : {}),
              },
              body: method === "POST" ? "" : undefined,
              signal: AbortSignal.timeout(15_000),
            });
            const preview = (await res.text()).slice(0, 400);
            if (res.ok && /^[[{]/.test(preview.trim())) {
              return { endpoint, method, status: res.status, preview };
            }
            if (method === "GET") {
              return { endpoint, method, status: res.status, preview: preview.slice(0, 120) };
            }
          } catch (err) {
            if (method === "GET") {
              return { endpoint, method, status: 0, preview: (err as Error).message };
            }
          }
        }
        return null;
      }),
  );

  return NextResponse.json({
    url: target,
    finalUrl,
    status,
    contentType,
    htmlLength: body.length,
    visibleTextLength: text.length,
    textSample: text.slice(0, 400),
    longAnchors: anchors.length,
    anchorSamples: anchors.slice(0, 8),
    hasNextPayload: body.includes("__next_f") || body.includes("__NEXT_DATA__"),
    payloadTextLength: extractNextPayloadText(body).length,
    scripts,
    dataUrls,
    endpointProbes: probes.filter(Boolean),
  });
}
