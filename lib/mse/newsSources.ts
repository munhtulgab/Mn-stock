import * as cheerio from "cheerio";

export interface NewsSourceExtract {
  url: string;
  text: string;
}

const USER_AGENT = "Mozilla/5.0 (compatible; MseRateAdvisor/1.0)";

/**
 * Crude generic extraction: fetch a user-configured news page and return
 * its visible text. Arbitrary news sites have no common structure, so we
 * don't try to parse articles — we hand the raw text to the LLM and let it
 * judge relevance to the company being analyzed.
 */
async function extractOne(url: string): Promise<NewsSourceExtract | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { url, text };
  } catch (err) {
    console.error(`news source fetch failed for ${url}`, err);
    return null;
  }
}

export async function fetchNewsSources(
  urls: string[],
): Promise<NewsSourceExtract[]> {
  const results = await Promise.all(urls.map(extractOne));
  return results.filter((r): r is NewsSourceExtract => r !== null);
}
