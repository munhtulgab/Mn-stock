import * as cheerio from "cheerio";

export interface NewsSourceExtract {
  url: string;
  text: string;
}

/** A headline found on a source page, with the link it points at. */
export interface NewsHeadline {
  title: string;
  url: string;
}

export type NewsSourceStatus =
  | "ok"
  | "login_required"
  | "empty"
  | "http_error"
  | "tls_error"
  | "timeout"
  | "error";

export interface NewsSourceResult extends NewsSourceExtract {
  status: NewsSourceStatus;
  chars: number;
  headlines: NewsHeadline[];
  /** Shown in settings when the source didn't yield anything usable. */
  reason?: string;
}

/**
 * A real browser string. Several Mongolian news sites sit behind bot
 * filters that answer a "compatible; SomeBot/1.0" agent with a challenge
 * page instead of the article list.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const TIMEOUT_MS = 15_000;

/**
 * Under this, a 200 response is a nav-only shell rather than an article
 * list — mse.mn itself renders client-side and yields zero body text.
 */
const MIN_TEXT_CHARS = 200;

/**
 * Sites that answer anonymous requests with a login page. Left to itself
 * the extractor would happily hand the LLM the words "Нууц үг / Нэвтрэх"
 * and call it news, so these are refused before a request is made.
 */
const LOGIN_WALLED_HOSTS = [
  "facebook.com",
  "instagram.com",
  "threads.net",
  "x.com",
  "twitter.com",
  "linkedin.com",
];

const FACEBOOK_HOSTS = ["facebook.com", "fb.com", "fb.watch"];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Facebook/Meta bounce anonymous readers through one of these. */
function isLoginUrl(url: string): boolean {
  return /\/(login|signin|sign_in|checkpoint)(\.php|\/|$|\?)/i.test(url);
}

const TLS_MESSAGE =
  "Сайтын SSL сертификатын гинж дутуу (intermediate certificate илгээдэггүй). " +
  "Хөтөч дээр хэвийн нээгддэг ч сервер талаас татах боломжгүй. Сайтын эзэн " +
  "сертификатаа бүрэн тохируулах хүртэл ашиглах боломжгүй.";

/**
 * A certificate chain the site itself serves incompletely fails here but not
 * in a browser, which quietly fetches the missing intermediate. Worth its own
 * status: it is neither a bot block nor an outage, and no retry will fix it.
 */
function isTlsFailure(err: unknown): boolean {
  const code = (err as { cause?: { code?: string } })?.cause?.code ?? "";
  return (
    /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(
      code,
    ) || /certificate|SSL routines/i.test((err as Error)?.message ?? "")
  );
}

/**
 * Egress proxies surface an upstream TLS failure as their own 5xx with the
 * OpenSSL reason in the body, so the same misconfiguration has to be
 * recognised from a response as well as from a thrown error.
 */
function bodyShowsTlsFailure(body: string): boolean {
  return /TLS_error|CERTIFICATE_VERIFY_FAILED|X509_verify_cert/i.test(body);
}

/**
 * Anchor text often carries the article's timestamp ahead of the title,
 * because the link wraps both. Drop a leading RFC-822 or ISO date so the
 * headline reads as a headline, and report whether one was there: a date
 * beside a link is strong evidence the link is an article rather than a
 * menu entry, which lets a dated headline clear a lower length bar.
 */
function cleanHeadline(text: string): { title: string; dated: boolean } {
  const title = text
    .replace(
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d{1,2}\s+\w{3,}\s+\d{4}[\s,]*\d{0,2}:?\d{0,2}:?\d{0,2}\s*(?:[+-]\d{4}|GMT|UTC|Z)?\s*/i,
      "",
    )
    .replace(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\s*/, "")
    .trim();
  return { title, dated: title.length !== text.length };
}

/**
 * Long enough to be a headline rather than "Бидэнтэй холбогдох". Measured
 * against real Mongolian news sites: below ~25 characters an undated anchor
 * is almost always nav or footer boilerplate.
 */
const MIN_HEADLINE_CHARS = 25;
const MIN_DATED_HEADLINE_CHARS = 12;

function fail(
  url: string,
  status: NewsSourceStatus,
  reason: string,
): NewsSourceResult {
  return { url, status, text: "", chars: 0, headlines: [], reason };
}

/**
 * Anchor texts long enough to be a headline rather than a menu item. Gives
 * the company-news view real title/link pairs instead of a wall of text.
 */
function extractHeadlines($: cheerio.CheerioAPI, baseUrl: string): NewsHeadline[] {
  const seen = new Set<string>();
  const headlines: NewsHeadline[] = [];

  $("a").each((_, el) => {
    const { title, dated } = cleanHeadline($(el).text().replace(/\s+/g, " ").trim());
    const min = dated ? MIN_DATED_HEADLINE_CHARS : MIN_HEADLINE_CHARS;
    if (title.length < min || title.length > 250) return;
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const key = `${title}|${absolute}`;
    if (seen.has(key)) return;
    seen.add(key);
    headlines.push({ title, url: absolute });
  });

  return headlines;
}

/**
 * Facebook has no anonymous read path: the page HTML redirects to a login
 * wall and the Graph API rejects unauthenticated reads outright. A page
 * access token is the only way in, so without one we say so plainly rather
 * than pretending the source is merely broken.
 */
async function fetchFacebook(
  url: string,
  token?: string,
): Promise<NewsSourceResult> {
  const slug = url
    .replace(/^https?:\/\/(?:[\w-]+\.)?facebook\.com\//i, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!slug) {
    return fail(url, "error", "Facebook хуудасны нэрийг линкээс уншиж чадсангүй.");
  }
  if (!token) {
    return fail(
      url,
      "login_required",
      "Facebook нэвтрэлтгүйгээр уншигдахгүй. Тохиргоо дотор Facebook хандалтын токен нэмвэл ажиллана.",
    );
  }

  try {
    const api = new URL(`https://graph.facebook.com/v21.0/${slug}/posts`);
    api.searchParams.set("fields", "message,created_time,permalink_url");
    api.searchParams.set("limit", "25");
    api.searchParams.set("access_token", token);

    const res = await fetch(api, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.error?.message ?? `Graph API ${res.status}`;
      return fail(url, "error", `Facebook: ${message}`);
    }

    const posts: { message?: string; created_time?: string; permalink_url?: string }[] =
      Array.isArray(body?.data) ? body.data : [];
    const withText = posts.filter((p) => p.message?.trim());
    if (withText.length === 0) {
      return fail(url, "empty", "Facebook хуудсанд бичвэртэй пост олдсонгүй.");
    }

    const text = withText
      .map((p) => `[${p.created_time?.slice(0, 10) ?? ""}] ${p.message!.trim()}`)
      .join("\n\n");
    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines: withText.map((p) => ({
        title: p.message!.trim().replace(/\s+/g, " ").slice(0, 200),
        url: p.permalink_url ?? url,
      })),
    };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return fail(
      url,
      timeout ? "timeout" : "error",
      timeout ? "Facebook хугацаа хэтэрлээ." : `Facebook: ${(err as Error).message}`,
    );
  }
}

/**
 * Fetch a user-configured news page and return its visible text plus the
 * headlines it links to. Arbitrary news sites share no structure, so the
 * text goes to the LLM verbatim and it judges relevance itself.
 */
async function extractOne(
  url: string,
  facebookToken?: string,
): Promise<NewsSourceResult> {
  const host = hostOf(url);
  if (!host) return fail(url, "error", "Линк буруу байна.");
  if (hostMatches(host, FACEBOOK_HOSTS)) return fetchFacebook(url, facebookToken);
  if (hostMatches(host, LOGIN_WALLED_HOSTS)) {
    return fail(
      url,
      "login_required",
      "Энэ сайт нэвтрэлт шаарддаг тул нийтийн хандалтаар агуулга уншигдахгүй.",
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "mn,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (isLoginUrl(res.url)) {
      return fail(url, "login_required", "Нэвтрэх хуудас руу шилжүүлсэн байна.");
    }
    const html = await res.text();

    if (!res.ok) {
      if (bodyShowsTlsFailure(html)) return fail(url, "tls_error", TLS_MESSAGE);
      return fail(
        url,
        "http_error",
        `Сайт ${res.status} хариу буцаалаа${res.status === 403 || res.status === 429 ? " (бот хамгаалалт байж магадгүй)" : ""}.`,
      );
    }

    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (text.length < MIN_TEXT_CHARS) {
      return fail(
        url,
        "empty",
        "Хуудсаас текст олдсонгүй — агуулгаа JavaScript-ээр ачаалладаг байж магадгүй.",
      );
    }

    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines: extractHeadlines($, res.url || url),
    };
  } catch (err) {
    console.error(`news source fetch failed for ${url}`, err);
    if (err instanceof Error && err.name === "TimeoutError") {
      return fail(
        url,
        "timeout",
        `Хугацаа хэтэрлээ (${TIMEOUT_MS / 1000}s дотор хариу ирсэнгүй).`,
      );
    }
    if (isTlsFailure(err)) return fail(url, "tls_error", TLS_MESSAGE);
    return fail(url, "error", (err as Error).message);
  }
}

/** Every configured source with its outcome, failures included. */
export async function fetchNewsSources(
  urls: string[],
  options: { facebookToken?: string } = {},
): Promise<NewsSourceResult[]> {
  return Promise.all(urls.map((url) => extractOne(url, options.facebookToken)));
}

/** Just the sources that produced usable text, for the AI prompt. */
export function usableExtracts(results: NewsSourceResult[]): NewsSourceExtract[] {
  return results
    .filter((r) => r.status === "ok")
    .map(({ url, text }) => ({ url, text }));
}

/**
 * Search terms for a company: its ticker plus the trading name with the
 * legal-form suffix dropped, so "Бодь Даатгал ХК" also matches headlines
 * that write it as "Бодь Даатгал".
 */
export function companyMatchTerms(symbol: string, name: string): string[] {
  const bare = name
    .replace(/\s*(ХК|ХХК|АА|ТӨХК|ТӨААТҮГ)\s*$/i, "")
    .replace(/["“”'']/g, "")
    .trim();
  return [symbol, bare, name].filter((t) => t.length >= 3);
}

/** Headlines that name the company, deduplicated across all sources. */
export function matchHeadlines(
  results: NewsSourceResult[],
  terms: string[],
): (NewsHeadline & { source: string })[] {
  const needles = terms.map((t) => t.toLowerCase());
  const seen = new Set<string>();
  const matches: (NewsHeadline & { source: string })[] = [];

  for (const result of results) {
    if (result.status !== "ok") continue;
    const source = hostOf(result.url) ?? result.url;
    for (const headline of result.headlines) {
      const haystack = headline.title.toLowerCase();
      if (!needles.some((n) => haystack.includes(n))) continue;
      if (seen.has(headline.url)) continue;
      seen.add(headline.url);
      matches.push({ ...headline, source });
    }
  }
  return matches;
}
