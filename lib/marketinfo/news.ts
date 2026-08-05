/**
 * marketinfo.mn news, straight from the API its own site reads.
 *
 * The pages are a React single-page app: the markup arrives as an empty
 * shell and every figure is fetched afterwards, so scraping the HTML yields
 * nothing no matter which path is configured. The requests behind it go to a
 * separate host — `service.marketinfo.mn` — which answers plain JSON over a
 * certificate chain that verifies, unlike the site's own.
 *
 * Article links are built from the id: the site has no field for them
 * (`url` is null unless the item is a reprint from elsewhere), while its
 * article pages are plainly addressed and search-indexed.
 */

const API_BASE = "https://service.marketinfo.mn";
const ARTICLE_BASE = "https://marketinfo.mn/news/detail";
const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface MarketInfoNewsItem {
  id: number;
  title: string;
  /** Standfirst paragraph, which carries most of the sentiment signal. */
  intro: string;
  /** Local `YYYY-MM-DDTHH:MM:SS` as the API states it. */
  date: string;
  url: string;
  source: string;
}

interface ApiNewsItem {
  id: number;
  title?: string;
  intro?: string;
  createdDate?: string;
  url?: string | null;
  isExternal?: boolean;
  source?: string;
}

/**
 * The site serves two shapes of the same feed: a bare array on the page's
 * own request, and a paged envelope from the service host. Accept either.
 */
function itemsFrom(payload: unknown): ApiNewsItem[] {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as ApiNewsItem[];
  const paged = (data as { news?: unknown })?.news;
  return Array.isArray(paged) ? (paged as ApiNewsItem[]) : [];
}

function toItem(raw: ApiNewsItem): MarketInfoNewsItem | null {
  const title = raw.title?.replace(/\s+/g, " ").trim();
  if (!title || !raw.id) return null;
  return {
    id: raw.id,
    title,
    intro: raw.intro?.replace(/\s+/g, " ").trim() ?? "",
    date: raw.createdDate?.slice(0, 19) ?? "",
    // A reprint keeps its original link; anything else lives on the site.
    url: raw.isExternal && raw.url ? raw.url : `${ARTICLE_BASE}/${raw.id}`,
    source: raw.source ?? "marketinfo.mn",
  };
}

/** Hosts whose news is served by this API rather than by their markup. */
export function isMarketInfoHost(host: string): boolean {
  const bare = host.replace(/^www\./, "").toLowerCase();
  return bare === "marketinfo.mn" || bare.endsWith(".marketinfo.mn");
}

export async function fetchMarketInfoNews(
  limit = 40,
): Promise<MarketInfoNewsItem[]> {
  const res = await fetch(`${API_BASE}/news`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`marketinfo news API ${res.status}`);

  const items = itemsFrom(await res.json())
    .map(toItem)
    .filter((i): i is MarketInfoNewsItem => i !== null);
  if (items.length === 0) throw new Error("marketinfo news API returned nothing");
  return items.slice(0, limit);
}

/** One dated line per article, title and standfirst, for the AI prompt. */
export function newsToText(items: MarketInfoNewsItem[]): string {
  return items
    .map((i) =>
      [i.date && `[${i.date.slice(0, 10)}]`, i.title, i.intro && `— ${i.intro}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}
