import { toLocalTimestamp } from "@/lib/mse/feed";

/**
 * Tavan Bogd Capital's research and market commentary, from the API its own
 * site reads.
 *
 * The site is a Next.js pages-router app whose `__NEXT_DATA__` carries empty
 * pageProps: every article is fetched afterwards from the browser. Scraping
 * the HTML therefore yields the navigation menu and nothing else — which is
 * exactly what the source check reported, a "working" source with 1,849
 * characters of menu items and one headline that was a menu entry.
 *
 * The API needs no key. Its base is `/web` — the site's own client picks a
 * service prefix per call ("web", "app", "main") and everything under
 * /api/news uses "web".
 */

const API_BASE = "https://tavanbogdcapital.com/web";
const ARTICLE_BASE = "https://tavanbogdcapital.com/news";
const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Public articles. The site grades access, and 4 is what it asks for. */
const ACCESS_LEVEL = 4;

export interface TavanBogdNewsItem {
  id: number;
  title: string;
  /** The site's own one-line standfirst. */
  brief: string;
  /** Article text with its markup removed, bounded for use as context. */
  body: string;
  /** Local `YYYY-MM-DDTHH:MM:SS`; the API states UTC. */
  date: string;
  url: string;
}

interface ApiNewsItem {
  id?: number;
  title?: string;
  brief?: string;
  body?: string;
  createdDate?: string;
  keyword?: { keyword?: string }[];
}

/** Article bodies are long; this is enough to name whom they are about. */
const BODY_CHARS = 2_000;

function plain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toItem(raw: ApiNewsItem): TavanBogdNewsItem | null {
  const title = raw.title?.replace(/\s+/g, " ").trim();
  if (!title || !raw.id) return null;

  // Tags name the instrument a piece is about ("USD BOND", a ticker), which
  // the prose sometimes only implies.
  const tags = (raw.keyword ?? [])
    .map((k) => k.keyword?.trim())
    .filter((k): k is string => !!k)
    .join(" ");

  return {
    id: raw.id,
    title,
    brief: [raw.brief?.replace(/\s+/g, " ").trim(), tags].filter(Boolean).join(" · "),
    body: plain(raw.body ?? "").slice(0, BODY_CHARS),
    date: toLocalTimestamp(raw.createdDate ?? ""),
    url: `${ARTICLE_BASE}/${raw.id}`,
  };
}

/** Hosts served by this API rather than by their markup. */
export function isTavanBogdHost(host: string): boolean {
  const bare = host.replace(/^www\./, "").toLowerCase();
  return bare === "tavanbogdcapital.com" || bare.endsWith(".tavanbogdcapital.com");
}

export async function fetchTavanBogdNews(limit = 40): Promise<TavanBogdNewsItem[]> {
  const res = await fetch(`${API_BASE}/api/news/getAllBasic`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      page: 0,
      size: limit,
      sort: "createdDate",
      access_level: ACCESS_LEVEL,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tavanbogdcapital.com ${res.status}`);

  const body = (await res.json()) as { news?: ApiNewsItem[] };
  const items = Array.isArray(body.news) ? body.news : [];
  return items
    .map(toItem)
    .filter((i): i is TavanBogdNewsItem => i !== null);
}

/** The articles as one block of text, for the AI prompt. */
export function newsToText(items: TavanBogdNewsItem[]): string {
  return items
    .map((i) =>
      [i.date && `[${i.date.slice(0, 10)}]`, i.title, i.brief && `— ${i.brief}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}
