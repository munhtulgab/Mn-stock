/**
 * Bloomberg TV Mongolia, from the API its own site reads.
 *
 * Another Next.js pages-router site with empty pageProps: the markup is a
 * menu and nothing else — 402 characters of it, which is why the source
 * reported "ok" with no headlines at all.
 *
 * Its API is public and, unusually, includes search. That matters here: the
 * latest-news endpoint returns ten items, so a company's coverage from last
 * week is out of reach by listing alone. Searching for the company by name
 * finds it however old it is.
 */

const API_BASE = "https://bloombergtv.mn/api/public";
const ARTICLE_BASE = "https://bloombergtv.mn/news";
const TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Endpoints that each return a slice of the front page. */
const LIST_PATHS = [
  "news/leftlatestnews",
  "news/topfeatured",
  "news/featured",
  "news/bodyMiddleNews",
];

export interface BloombergTvNewsItem {
  title: string;
  /** Standfirst, which is where a company is usually named. */
  description: string;
  /** Local `YYYY-MM-DDTHH:MM:SS`; search results carry none. */
  date: string;
  url: string;
}

interface ApiNewsItem {
  slug?: string;
  title?: string;
  description?: string;
  createdAt?: string | null;
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function toItem(raw: ApiNewsItem): BloombergTvNewsItem | null {
  const title = clean(raw.title);
  if (!title || !raw.slug) return null;
  return {
    title,
    description: clean(raw.description),
    // Already Ulaanbaatar local, stated as "2026-08-05 16:15:00".
    date: clean(raw.createdAt).replace(" ", "T"),
    url: `${ARTICLE_BASE}/${raw.slug}`,
  };
}

export function isBloombergTvHost(host: string): boolean {
  const bare = host.replace(/^www\./, "").toLowerCase();
  return bare === "bloombergtv.mn" || bare.endsWith(".bloombergtv.mn");
}

async function call(
  path: string,
  init?: { body: unknown },
): Promise<ApiNewsItem[]> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: init ? "POST" : "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? (body as ApiNewsItem[]) : [];
}

/**
 * How many company names to look up. Each is a request, and beyond the
 * trading name the terms get less specific rather than more.
 */
const MAX_SEARCHES = 2;

/**
 * Search results carry no date, and an undated item sorts below every dated
 * one — which would file this week's company report under a notice from
 * 2023. The article page states it, so a bounded number are filled in.
 *
 * Twelve was too few to find the recent ones. The search answers by
 * relevance rather than by date and its own order is close to arbitrary —
 * the first result for "алтны үнэ" is from 2023 — so the twelve that got
 * dated were whichever twelve came first, and a page filled from them read
 * as an archive. Measured over a forty-item sample of that same search:
 * dating twelve reached August 2024, dating forty reached March 2025. These
 * are one request each, run together, and only ever for items a listing
 * search returned undated.
 */
const MAX_DATE_LOOKUPS = 24;

async function articleDate(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const payload = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    if (!payload) return "";
    const data = JSON.parse(payload[1]) as {
      props?: { pageProps?: { data?: { news?: { createdAt?: string; updatedAt?: string } } } };
    };
    const news = data.props?.pageProps?.data?.news;
    return clean(news?.createdAt ?? news?.updatedAt).replace(" ", "T");
  } catch {
    return "";
  }
}

async function withDates(items: BloombergTvNewsItem[]): Promise<BloombergTvNewsItem[]> {
  const undated = items.filter((i) => !i.date).slice(0, MAX_DATE_LOOKUPS);
  if (undated.length === 0) return items;

  const dates = await Promise.all(undated.map((i) => articleDate(i.url)));
  const byUrl = new Map(undated.map((item, i) => [item.url, dates[i]]));
  return items.map((item) =>
    item.date ? item : { ...item, date: byUrl.get(item.url) ?? "" },
  );
}

/**
 * The front page, plus anything the site knows about the given names.
 *
 * Searching is what reaches a story that has scrolled off the front page —
 * "Дархан хүнс: Оны эхний хагас жилд..." is not among the latest ten, but
 * the site finds it by name immediately.
 */
export async function fetchBloombergTvNews(
  searchTerms: string[] = [],
): Promise<BloombergTvNewsItem[]> {
  const queries = searchTerms
    .filter((t) => t.length >= 3)
    .slice(0, MAX_SEARCHES)
    .map((term) => call("news/search", { body: { filterdata: term } }));

  const batches = await Promise.allSettled([
    ...LIST_PATHS.map((path) => call(path)),
    ...queries,
  ]);

  const items: BloombergTvNewsItem[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const raw of batch.value) {
      const item = toItem(raw);
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
  }

  const dated = await withDates(items);
  return dated.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/** The articles as one block of text, for the AI prompt. */
export function newsToText(items: BloombergTvNewsItem[]): string {
  return items
    .map((i) =>
      [i.date && `[${i.date.slice(0, 10)}]`, i.title, i.description && `— ${i.description}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}
