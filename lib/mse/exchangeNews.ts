import { callMseAction } from "./action";

/**
 * The exchange's own newsroom.
 *
 * `fetchCompanyNews` reads the notices listed on one security's profile; this
 * is the market-wide feed the site itself shows at /news — daily trading
 * reports, primary-market results, listing and dividend notices. It comes
 * from the same data fetcher as the indices, with the parameters the site's
 * news page uses: without `orderby` and `perpage` the endpoint answers
 * "Server Error" rather than an empty list.
 */

const ARTICLE_BASE = "https://mse.mn/news";

export interface ExchangeNewsItem {
  title: string;
  /** The exchange's standfirst, a sentence or two. */
  description: string;
  /** YYYY-MM-DD as stated. */
  date: string;
  url: string;
}

interface ApiNews {
  data?: { id?: number; date?: string; title?: string; description?: string }[];
}

function isNewsPage(value: unknown): value is ApiNews {
  const data = (value as ApiNews)?.data;
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0]?.title === "string" &&
    typeof data[0]?.date === "string"
  );
}

function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Newest first. `category` narrows to one of the site's own tabs — "event",
 * "dividend", "interview" — and is omitted for everything.
 */
export async function fetchExchangeNews(
  limit = 30,
  category?: string,
): Promise<ExchangeNewsItem[]> {
  const parameter =
    `?lang=mn&orderby=DESC&page=1&perpage=${limit}` +
    (category ? `&category=${category}` : "");

  const page = await callMseAction("news", parameter, isNewsPage);
  if (!page) return [];

  return (page.data ?? [])
    .filter((n) => n.id && n.title)
    .map((n) => ({
      title: clean(n.title),
      description: clean(n.description),
      date: clean(n.date).slice(0, 10),
      url: `${ARTICLE_BASE}/${n.id}`,
    }));
}
