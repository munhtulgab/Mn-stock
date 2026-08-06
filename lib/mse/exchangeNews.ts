import { callMseAction, callMseActionWithText } from "./action";

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

/* -------------------------------------------------------------------------
   One article, in full.

   The listing gives a headline and a standfirst; the report itself — how many
   companies rose, which ones moved furthest, what the bond and mining
   sessions did — is only in the article, behind a separate call. It comes
   back as editor HTML, which is turned into paragraphs and bullets here so
   the page can render it as its own markup rather than trusting a foreign
   document's tags.
   ------------------------------------------------------------------------- */

/**
 * One paragraph, one bullet, or one table of an article's body.
 *
 * The weekly review is largely tables — the week's most-active securities,
 * its biggest movers — and reading those cell by cell as if they were
 * sentences turns a five-paragraph article into four hundred fragments, so
 * a table stays a table.
 */
export type ArticleBlock =
  | { kind: "p" | "li"; text: string }
  | { kind: "table"; rows: string[][] };

export interface ExchangeArticle {
  id: number;
  title: string;
  /** YYYY-MM-DD as stated. */
  date: string;
  url: string;
  body: ArticleBlock[];
}

interface ApiArticle {
  id?: number;
  title?: string;
  description?: string;
  date?: string;
}

function isArticle(value: unknown): value is ApiArticle {
  const article = value as ApiArticle;
  return (
    !!article &&
    typeof article === "object" &&
    !Array.isArray(article) &&
    typeof article.title === "string" &&
    typeof article.description === "string"
  );
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1]?.toLowerCase() === "x"
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Tags stripped, entities decoded, runs of space collapsed. */
function plain(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Editor HTML to blocks. Splitting on the closing tag rather than parsing:
 * the exchange's articles are paragraphs, lists, tables and inline styling,
 * and what is wanted from them is the text with its breaks kept.
 */
export function articleBlocks(html: string): ArticleBlock[] {
  const withoutCode = html.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "");
  const blocks: ArticleBlock[] = [];

  // Tables come out whole first, so what is left is prose and can be split on
  // its own closing tags without a table's cells joining in.
  let last = 0;
  const tables = /<table[\s\S]*?<\/table\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tables.exec(withoutCode))) {
    blocks.push(...proseBlocks(withoutCode.slice(last, match.index)));
    const rows = tableRows(match[0]);
    if (rows.length > 0) blocks.push({ kind: "table", rows });
    last = match.index + match[0].length;
  }
  blocks.push(...proseBlocks(withoutCode.slice(last)));

  return blocks;
}

function proseBlocks(html: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  // A list item holding a paragraph would otherwise close twice and leave a
  // stray empty bullet, so the inner paragraph's close is dropped first.
  const flattened = html.replace(/<\/p\s*>\s*(?=<\/li\s*>)/gi, "");

  const closes = /<\/(p|li|h[1-6]|div)\s*>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  const push = (tag: string, chunk: string) => {
    const text = plain(chunk);
    // A paragraph holding one non-breaking space is a spacer, not a sentence.
    if (text) blocks.push({ kind: tag === "li" ? "li" : "p", text });
  };

  while ((match = closes.exec(flattened))) {
    push(match[1].toLowerCase(), flattened.slice(last, match.index));
    last = match.index + match[0].length;
  }
  push("p", flattened.slice(last));
  return blocks;
}

function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row.matchAll(/<(t[dh])[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(
      (cell) => plain(cell[2]),
    );
    if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  }
  return rows;
}

export async function fetchExchangeArticle(
  id: number,
): Promise<ExchangeArticle | null> {
  const payload = await callMseActionWithText("singleNews", `?id=${id}`, isArticle);
  if (!payload) return null;

  const article = payload.value as ApiArticle;
  // The body is long enough that the reply carries it as its own row and
  // leaves a reference here.
  const reference = /^\$(\d+)$/.exec(article.description ?? "");
  const html = reference
    ? (payload.text.get(reference[1]) ?? "")
    : (article.description ?? "");

  return {
    id,
    title: clean(article.title),
    date: clean(article.date).slice(0, 10),
    url: `${ARTICLE_BASE}/${id}`,
    body: articleBlocks(html),
  };
}
