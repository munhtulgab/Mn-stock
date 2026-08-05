import * as cheerio from "cheerio";

/**
 * RSS/Atom support for news sources.
 *
 * Scraping a rendered homepage means sifting article links out of menus,
 * footers and ad slots. A feed is the same publisher's own structured
 * output: titles, canonical links, publication dates and summaries, with
 * none of the furniture. Where a source offers one, it is strictly better
 * input both for the AI prompt and for company-name matching.
 */

export interface FeedItem {
  title: string;
  url: string;
  /** Local `YYYY-MM-DD[THH:MM:SS]`, or "" when the feed states none. */
  date: string;
  summary: string;
}

/**
 * Paths worth trying when a site advertises no feed. None of the Mongolian
 * outlets tested carry the standard <link rel="alternate"> hint even when
 * they do serve a feed — lemonpress.mn, for one, answers at /rss.xml.
 */
export const FEED_PATHS = ["/rss", "/rss.xml", "/feed"];

export function looksLikeFeed(body: string, contentType?: string): boolean {
  if (contentType && /(application|text)\/(rss|atom)\+xml/i.test(contentType)) {
    return true;
  }
  return /^\s*(<\?xml[^>]*\?>\s*)?<(rss|feed)[\s>]/i.test(body.slice(0, 500));
}

/** The <link rel="alternate"> feed hint, when a page bothers to publish one. */
export function feedLinkFromHtml(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): string | null {
  const href = $('link[rel="alternate"]')
    .filter((_, el) => /(rss|atom)\+xml/i.test($(el).attr("type") ?? ""))
    .first()
    .attr("href");
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** cheerio v1 no longer exports an Element type; work off the wrapped node. */
type Node = ReturnType<cheerio.CheerioAPI>;

function textOf(node: Node, tag: string): string {
  return node.children(tag).first().text().replace(/\s+/g, " ").trim();
}

/** Strips the HTML that feeds routinely embed inside <description>. */
function plain(html: string): string {
  if (!html) return "";
  return cheerio.load(`<div>${html}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

/** Mongolia runs at UTC+8 year round; the exchange has no daylight saving. */
const ULAANBAATAR_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Publication time as `YYYY-MM-DDTHH:MM:SS`, in Ulaanbaatar time.
 *
 * Feeds date their items in RFC-822 with an explicit zone, while the
 * exchange and marketinfo state a bare local timestamp. Left mixed, a story
 * published at 07:00 local would sort as 23:00 the previous day and display
 * the wrong hour, so anything carrying a zone is shifted into local time and
 * anything without one is taken as already local.
 */
export function toLocalTimestamp(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const hasTime = /\d{1,2}:\d{2}/.test(trimmed);
  const hasZone = /(Z|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/i.test(trimmed);

  if (!hasTime) {
    const dateOnly = trimmed.match(/\d{4}-\d{2}-\d{2}/);
    if (dateOnly) return dateOnly[0];
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    // Already-local forms like "2026-07-30 09:44:00" that Date won't take.
    const local = trimmed.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/);
    return local ? local[0].replace(" ", "T") : "";
  }
  if (!hasZone) {
    // Parsed as UTC by Date, but the source meant local: keep its own digits.
    const local = trimmed.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/);
    if (local) return local[0].replace(" ", "T");
  }
  return new Date(parsed.getTime() + ULAANBAATAR_OFFSET_MS)
    .toISOString()
    .slice(0, 19);
}

export function parseFeed(xml: string, baseUrl: string): FeedItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: FeedItem[] = [];

  $("item").each((_, el) => {
    const node = $(el);
    const title = textOf(node, "title");
    if (!title) return;
    items.push({
      title,
      url: absolute(
        textOf(node, "link") || node.children("guid").first().text(),
        baseUrl,
      ),
      date: toLocalTimestamp(textOf(node, "pubDate") || textOf(node, "date")),
      summary: plain(textOf(node, "description")).slice(0, 600),
    });
  });

  // Atom, only when the document carried no RSS <item> at all.
  if (items.length === 0) {
    $("entry").each((_, el) => {
      const node = $(el);
      const title = textOf(node, "title");
      if (!title) return;
      items.push({
        title,
        url: absolute(node.children("link").first().attr("href") ?? "", baseUrl),
        date: toLocalTimestamp(textOf(node, "updated") || textOf(node, "published")),
        summary: plain(textOf(node, "summary") || textOf(node, "content")).slice(0, 600),
      });
    });
  }

  return items;
}

function absolute(href: string, baseUrl: string): string {
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

/** Feed items rendered for the LLM: one dated line per article. */
export function feedToText(items: FeedItem[]): string {
  return items
    .map((i) =>
      [i.date && `[${i.date.slice(0, 10)}]`, i.title, i.summary && `— ${i.summary}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}
