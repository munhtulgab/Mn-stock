import type { Db } from "mongodb";
import * as cheerio from "cheerio";
import {
  fetchWithExtraCa,
  parsePemBundle,
  type PageResponse,
} from "@/lib/tls/extraCa";
import {
  fetchMarketInfoNews,
  isMarketInfoHost,
  newsToText,
} from "@/lib/marketinfo/news";
import {
  fetchTavanBogdNews,
  isTavanBogdHost,
  newsToText as tavanBogdNewsToText,
} from "@/lib/tavanbogd/news";
import {
  fetchBloombergTvNews,
  isBloombergTvHost,
  newsToText as bloombergTvNewsToText,
} from "@/lib/bloombergtv/news";
import { extractNextPayloadText } from "./nextPayload";
import {
  fetchWithApify,
  fetchWithCookie,
  fetchWithToken,
  pageSlug,
  type FacebookFetch,
} from "./facebook";
import {
  FEED_PATHS,
  feedLinkFromHtml,
  feedToText,
  looksLikeFeed,
  parseFeed,
} from "./feed";

export interface NewsSourceExtract {
  url: string;
  text: string;
}

/** A headline found on a source page, with the link it points at. */
export interface NewsHeadline {
  title: string;
  url: string;
  /**
   * The item's body or standfirst, kept for matching rather than display.
   * A company is named in a headline far less often than in the story
   * itself, so matching titles alone drops most of what mentions it.
   */
  summary?: string;
  /**
   * Publication date as YYYY-MM-DD where the source states one. Feeds and
   * JSON APIs do; a headline scraped from an anchor usually does not, so
   * consumers that sort by date must tolerate it being absent.
   */
  date?: string;
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
  /** Which route produced the content. */
  via?: "feed" | "html" | "payload" | "api";
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

/** Every way in that the operator has configured, in preference order. */
interface FacebookCredentials {
  apifyToken?: string;
  cookie?: string;
  token?: string;
  db?: Db;
}

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

/**
 * Rendered text below this is a shell — a header and a menu — rather than an
 * article list, and is worth comparing against a client-side payload.
 */
const SHELL_TEXT_CHARS = 1_500;

/**
 * Where a site keeps its articles when the address given was the bare root.
 * A dashboard-style home page (marketinfo.mn is one) renders its figures
 * through widgets and leaves nothing to read, while the news section is
 * ordinary server-rendered HTML — Google has those article pages indexed.
 */
const CONTENT_PATHS = ["/news", "/mn/news", "/news/list", "/en/news"];

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
    // "%23" is "#" already encoded, which a menu built for a single-page app
    // routinely emits — tavanbogdcapital.com's one "headline" was a nav entry
    // linking there.
    if (!href || href.startsWith("#") || href === "%23" || href.startsWith("javascript:")) {
      return;
    }

    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    // A link back to the page it sits on is navigation, not an article.
    if (absolute.replace(/[#?].*$/, "") === baseUrl.replace(/[#?].*$/, "")) return;
    const key = `${title}|${absolute}`;
    if (seen.has(key)) return;
    seen.add(key);
    headlines.push({ title, url: absolute });
  });

  return headlines;
}

/**
 * Facebook has no anonymous read path: every entry point redirects to a
 * login wall or returns a shell that fills itself in with JavaScript. A
 * saved page therefore needs either the operator's session cookie — which
 * reads any page the account can see — or a Graph API token, which reads
 * only the pages it was issued for. The cookie is tried first because that
 * is the one that makes an ordinary saved page work.
 */
async function fetchFacebook(
  url: string,
  credentials: FacebookCredentials,
): Promise<NewsSourceResult> {
  if (!pageSlug(url)) {
    return fail(url, "error", "Facebook хуудасны нэрийг линкээс уншиж чадсангүй.");
  }
  const { apifyToken, cookie, token, db } = credentials;
  if (!apifyToken && !cookie && !token) {
    return fail(
      url,
      "login_required",
      "Facebook нэвтрэлтгүйгээр уншигдахгүй. Тохиргоо дотор Apify түлхүүр " +
        "(үнэгүй), Facebook cookie эсвэл хандалтын токены аль нэгийг нэмвэл " +
        "хадгалсан хуудаснууд ажиллана.",
    );
  }

  let result: FacebookFetch = { posts: [] };
  // Cheapest to set up first; each is only tried if the one before it came
  // back with nothing, so a working route costs a single request.
  const routes: (() => Promise<FacebookFetch>)[] = [];
  if (apifyToken) routes.push(() => fetchWithApify(url, apifyToken, db));
  if (cookie) routes.push(() => fetchWithCookie(url, cookie));
  if (token) routes.push(() => fetchWithToken(url, token));

  for (const route of routes) {
    const attempt = await route();
    if (attempt.posts.length > 0) {
      result = attempt;
      break;
    }
    result = { ...attempt, error: result.error ?? attempt.error };
  }

  if (result.posts.length === 0) {
    return fail(
      url,
      result.loginWall ? "login_required" : "empty",
      result.error ?? "Facebook хуудсанд бичвэртэй пост олдсонгүй.",
    );
  }

  const text = result.posts
    .map((p) => `[${p.date ?? ""}] ${p.text}`)
    .join("\n\n");
  return {
    url,
    status: "ok",
    via: "api",
    text,
    chars: text.length,
    headlines: result.posts.map((p) => ({
      title: p.text.slice(0, 200),
      url: p.url ?? url,
      date: p.date,
      // The whole post, so a company named halfway down it still matches.
      summary: p.text,
    })),
  };
}

/**
 * A full browser header set, not just a User-Agent. Bot filters score the
 * whole request: lemonpress.mn answers a bare two-header fetch with 403 from
 * a datacentre address while serving the same page to a browser.
 */
const BROWSER_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "mn-MN,mn;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Loads a page, retrying through the extra-CA path when the plain fetch trips
 * over a site that omits its intermediate certificate. `viaExtraCa` says which
 * route produced the answer, so the caller can tell "no certificate supplied
 * yet" apart from "supplied and still failing".
 */
async function loadPage(
  url: string,
  extraCerts: string[],
): Promise<PageResponse & { viaExtraCa: boolean; contentType?: string }> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.text();
    // An egress proxy reports the upstream chain failure as its own 5xx, so
    // the retry has to trigger on that shape too, not just a thrown error.
    // Retry whenever the chain is the problem: the missing certificate is
    // usually recoverable from the site itself, no operator input needed.
    if (!res.ok && bodyShowsTlsFailure(body)) {
      return {
        ...(await fetchWithExtraCa(url, {
          extraCerts,
          headers: BROWSER_HEADERS,
          timeoutMs: TIMEOUT_MS,
        })),
        viaExtraCa: true,
      };
    }
    return {
      status: res.status,
      finalUrl: res.url,
      body,
      viaExtraCa: false,
      contentType: res.headers.get("content-type") ?? undefined,
    };
  } catch (err) {
    if (isTlsFailure(err)) {
      return {
        ...(await fetchWithExtraCa(url, {
          extraCerts,
          headers: BROWSER_HEADERS,
          timeoutMs: TIMEOUT_MS,
        })),
        viaExtraCa: true,
      };
    }
    throw err;
  }
}

/** Builds a result from feed XML, or null when it holds no usable items. */
function fromFeed(
  url: string,
  xml: string,
  feedUrl: string,
): NewsSourceResult | null {
  const items = parseFeed(xml, feedUrl);
  if (items.length === 0) return null;
  const text = feedToText(items);
  return {
    url,
    status: "ok",
    text,
    chars: text.length,
    headlines: items.map((i) => ({
      title: i.title,
      url: i.url,
      date: i.date,
      summary: i.summary,
    })),
    via: "feed",
  };
}

/**
 * Locates a page's feed: the standard autodiscovery hint first, then the
 * handful of conventional paths, since none of the Mongolian outlets
 * checked publish the hint even when they do serve a feed.
 */
async function findFeed(
  $: cheerio.CheerioAPI | null,
  url: string,
  pageUrl: string,
  extraCerts: string[],
): Promise<NewsSourceResult | null> {
  const candidates: string[] = [];
  const advertised = $ ? feedLinkFromHtml($, pageUrl) : null;
  if (advertised) candidates.push(advertised);
  for (const path of FEED_PATHS) {
    try {
      candidates.push(new URL(path, new URL(pageUrl).origin).toString());
    } catch {
      // A malformed page URL just means one fewer candidate to try.
    }
  }

  const fetched = await Promise.all(
    candidates.map((candidate) =>
      loadPage(candidate, extraCerts).catch(() => null),
    ),
  );

  for (let i = 0; i < fetched.length; i++) {
    const res = fetched[i];
    if (!res || res.status < 200 || res.status >= 300) continue;
    if (!looksLikeFeed(res.body, res.contentType)) continue;
    const result = fromFeed(url, res.body, candidates[i]);
    if (result) return result;
  }
  return null;
}

/**
 * marketinfo.mn renders entirely on the client, so no amount of markup
 * reading helps — its news comes from the JSON API the site itself calls.
 */
async function fetchMarketInfo(url: string): Promise<NewsSourceResult> {
  try {
    const items = await fetchMarketInfoNews();
    const text = newsToText(items);
    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines: items.map((i) => ({
        title: i.title,
        url: i.url,
        date: i.date,
        summary: i.intro,
      })),
      via: "api",
      reason: "marketinfo.mn-ийн JSON API-аас уншлаа.",
    };
  } catch (err) {
    return fail(url, "error", `marketinfo API: ${(err as Error).message}`);
  }
}

/**
 * Same story at tavanbogdcapital.com: the markup is a shell whose articles
 * arrive from an API afterwards, so reading the page returned its navigation
 * menu and called it news.
 */
async function fetchTavanBogd(url: string): Promise<NewsSourceResult> {
  try {
    const items = await fetchTavanBogdNews();
    if (items.length === 0) {
      return fail(url, "empty", "tavanbogdcapital.com API хоосон хариу өглөө.");
    }
    const text = tavanBogdNewsToText(items);
    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines: items.map((i) => ({
        title: i.title,
        url: i.url,
        date: i.date,
        // Standfirst, tags and the article text: a company is named in the
        // piece far more often than in its headline.
        summary: `${i.brief} ${i.body}`.trim(),
      })),
      via: "api",
      reason: "tavanbogdcapital.com-ийн JSON API-аас уншлаа.",
    };
  } catch (err) {
    return fail(url, "error", `tavanbogdcapital API: ${(err as Error).message}`);
  }
}

/**
 * Bloomberg TV Mongolia, likewise a shell over an API — and the one source
 * that can be asked about a company directly rather than filtered after the
 * fact, which is how a story older than the front page is reached at all.
 */
async function fetchBloombergTv(
  url: string,
  searchTerms: string[],
): Promise<NewsSourceResult> {
  try {
    const items = await fetchBloombergTvNews(searchTerms);
    if (items.length === 0) {
      return fail(url, "empty", "bloombergtv.mn API хоосон хариу өглөө.");
    }
    const text = bloombergTvNewsToText(items);
    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines: items.map((i) => ({
        title: i.title,
        url: i.url,
        date: i.date || undefined,
        summary: i.description,
      })),
      via: "api",
      reason: searchTerms.length
        ? `bloombergtv.mn-ийн JSON API (хайлт: ${searchTerms.slice(0, 2).join(", ")}).`
        : "bloombergtv.mn-ийн JSON API-аас уншлаа.",
    };
  } catch (err) {
    return fail(url, "error", `bloombergtv API: ${(err as Error).message}`);
  }
}

/**
 * Reads a site's news section when the address configured was its root and
 * that root turned out to be an empty shell. Only ever a fallback, and the
 * address that actually produced the text is reported back.
 */
async function tryContentPaths(
  url: string,
  extraCerts: string[],
): Promise<NewsSourceResult | null> {
  let origin: string;
  let path: string;
  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    path = parsed.pathname;
  } catch {
    return null;
  }
  if (path !== "/" && path !== "") return null;

  for (const candidate of CONTENT_PATHS) {
    const target = `${origin}${candidate}`;
    const res = await loadPage(target, extraCerts).catch(() => null);
    if (!res || res.status < 200 || res.status >= 300) continue;

    const $ = cheerio.load(res.body);
    const headlines = extractHeadlines($, res.finalUrl || target);
    $("script, style, noscript, svg").remove();
    const rendered = $("body").text().replace(/\s+/g, " ").trim();

    // The section may itself be client-rendered; recover its payload too.
    const payload =
      rendered.length < SHELL_TEXT_CHARS ? extractNextPayloadText(res.body) : "";
    const usePayload =
      payload.length >= MIN_TEXT_CHARS && payload.length > rendered.length * 2;
    const text = usePayload ? payload : rendered;
    if (text.length < MIN_TEXT_CHARS) continue;

    return {
      url,
      status: "ok",
      text,
      chars: text.length,
      headlines,
      via: usePayload ? "payload" : "html",
      reason: `Үндсэн хуудас хоосон тул ${candidate} хэсгээс уншлаа.`,
    };
  }
  return null;
}

/**
 * Fetch a user-configured news page and return its visible text plus the
 * headlines it links to. Arbitrary news sites share no structure, so the
 * text goes to the LLM verbatim and it judges relevance itself.
 */
async function extractOne(
  url: string,
  facebook: FacebookCredentials = {},
  extraCerts: string[] = [],
  searchTerms: string[] = [],
): Promise<NewsSourceResult> {
  const host = hostOf(url);
  if (!host) return fail(url, "error", "Линк буруу байна.");
  if (hostMatches(host, FACEBOOK_HOSTS)) return fetchFacebook(url, facebook);
  if (isMarketInfoHost(host)) return fetchMarketInfo(url);
  if (isTavanBogdHost(host)) return fetchTavanBogd(url);
  if (isBloombergTvHost(host)) return fetchBloombergTv(url, searchTerms);
  if (hostMatches(host, LOGIN_WALLED_HOSTS)) {
    return fail(
      url,
      "login_required",
      "Энэ сайт нэвтрэлт шаарддаг тул нийтийн хандалтаар агуулга уншигдахгүй.",
    );
  }

  // The page fetch and the feed hunt are separate chances at the same source.
  // A homepage that bot-blocks or renders client-side says nothing about
  // whether the publisher also serves a feed — lemonpress.mn answers 403 on
  // the page and 200 on /rss.xml — so a failure here is held, not returned.
  let page: Awaited<ReturnType<typeof loadPage>> | null = null;
  let failure: NewsSourceResult | null = null;

  try {
    const res = await loadPage(url, extraCerts);
    if (isLoginUrl(res.finalUrl)) {
      return fail(url, "login_required", "Нэвтрэх хуудас руу шилжүүлсэн байна.");
    }
    if (res.status >= 200 && res.status < 300) {
      page = res;
    } else if (bodyShowsTlsFailure(res.body)) {
      failure = fail(url, "tls_error", TLS_MESSAGE);
    } else {
      failure = fail(
        url,
        "http_error",
        `Сайт ${res.status} хариу буцаалаа${res.status === 403 || res.status === 429 ? " (бот хамгаалалт байж магадгүй)" : ""}.`,
      );
    }
  } catch (err) {
    console.error(`news source fetch failed for ${url}`, err);
    failure =
      err instanceof Error && err.name === "TimeoutError"
        ? fail(
            url,
            "timeout",
            `Хугацаа хэтэрлээ (${TIMEOUT_MS / 1000}s дотор хариу ирсэнгүй).`,
          )
        : isTlsFailure(err)
          ? fail(url, "tls_error", TLS_MESSAGE)
          : fail(url, "error", (err as Error).message);
  }

  // The address itself may already be a feed, if that's what was configured.
  if (page && looksLikeFeed(page.body, page.contentType)) {
    const direct = fromFeed(url, page.body, page.finalUrl || url);
    if (direct) return direct;
  }

  const $ = page ? cheerio.load(page.body) : null;

  // Prefer the publisher's own feed over the rendered page: same articles,
  // with dates and summaries and none of the nav furniture. Runs even when
  // the page itself never loaded.
  const feed = await findFeed($, url, page?.finalUrl || url, extraCerts);
  if (feed) return feed;

  if (!page || !$) {
    return failure ?? fail(url, "error", "Агуулга татаж чадсангүй.");
  }

  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  // A client-rendered page leaves a nav-only shell in the markup and ships
  // its copy in the RSC payload instead. Judge by how thin the rendered text
  // is, not merely by whether it is empty: invest.tdbs.mn renders 487
  // characters of menu over some 58,000 characters of payload.
  if (text.length < SHELL_TEXT_CHARS) {
    const payloadText = extractNextPayloadText(page.body);
    if (
      payloadText.length >= MIN_TEXT_CHARS &&
      payloadText.length > text.length * 2
    ) {
      return {
        url,
        status: "ok",
        text: payloadText,
        chars: payloadText.length,
        // The payload carries prose, not title/link pairs worth trusting.
        headlines: extractHeadlines($, page.finalUrl || url),
        via: "payload",
      };
    }
  }

  if (text.length < MIN_TEXT_CHARS) {
    const section = await tryContentPaths(url, extraCerts);
    if (section) return section;
    return fail(
      url,
      "empty",
      "Хуудсаас текст олдсонгүй — агуулгаа JavaScript-ээр ачаалладаг ба RSS feed нь ч олдсонгүй.",
    );
  }

  return {
    url,
    status: "ok",
    text,
    chars: text.length,
    headlines: extractHeadlines($, page.finalUrl || url),
    via: "html",
  };
}

/** Every configured source with its outcome, failures included. */
export async function fetchNewsSources(
  urls: string[],
  options: {
    apifyToken?: string;
    facebookToken?: string;
    facebookCookie?: string;
    extraCaCerts?: string;
    /** Lets the Facebook scrape cache its result instead of re-running. */
    db?: Db;
    /**
     * Company names to ask sources about directly. Only sources with their
     * own search use them; the rest are filtered after fetching as before.
     */
    searchTerms?: string[];
  } = {},
): Promise<NewsSourceResult[]> {
  const extraCerts = options.extraCaCerts
    ? parsePemBundle(options.extraCaCerts)
    : [];
  const facebook: FacebookCredentials = {
    apifyToken: options.apifyToken,
    cookie: options.facebookCookie,
    token: options.facebookToken,
    db: options.db,
  };
  return Promise.all(
    urls.map((url) => extractOne(url, facebook, extraCerts, options.searchTerms ?? [])),
  );
}

/** Just the sources that produced usable text, for the AI prompt. */
export function usableExtracts(results: NewsSourceResult[]): NewsSourceExtract[] {
  return results
    .filter((r) => r.status === "ok")
    .map(({ url, text }) => ({ url, text }));
}

/** The trading name without its legal form or quote marks. */
function bareName(name: string): string {
  return name
    .replace(/\s*(ХК|ХХК|АА|ТӨХК|ТӨААТҮГ)\s*$/i, "")
    .replace(/["“”'']/g, "")
    .trim();
}

/** Short words carry no identity: "Их", "Сүү", "Ард" name half the market. */
const MIN_DISTINCTIVE_CHARS = 5;

/**
 * First words that belong to exactly one listed company.
 *
 * Writers rarely give a company its registered name in full — a post says
 * "Инновэйшн ХК", not "Инновэйшн инвестмент ХК" — so the leading word is
 * worth matching on. Only when it is unique, though: 19 listings begin with
 * "Монгол" and 12 with "Дархан", and matching those would file every
 * mention of the country under a dozen unrelated companies.
 */
export function distinctiveNameWords(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const name of names) {
    const first = bareName(name).split(/\s+/)[0]?.toLowerCase() ?? "";
    if (first.length < MIN_DISTINCTIVE_CHARS) continue;
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n === 1).map(([word]) => word));
}

/** A term is either a phrase to find or a shape to recognise. */
export type MatchTerm = string | RegExp;

/** How a Mongolian listing is written: the form follows the name. */
const COMPANY_FORMS = "ХК|ХХК|ББСБ|ТӨХК|банк";

/** Room for the rest of a registered name between the two. */
const NAME_TAIL_CHARS = 24;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Search terms for a company: its ticker, the trading name with the legal
 * form dropped so "Бодь Даатгал ХК" also matches "Бодь Даатгал", and — when
 * it identifies this company alone — the name's first word.
 *
 * That first word is required to be followed by a company form, because
 * uniqueness among registered names says nothing about uniqueness in
 * Mongolian: TDB is "Худалдаа Хөгжлийн банк" and SBM is "Төрийн Банк", and
 * on their own those words picked up "дэлхийн худалдааны байгууллага" and
 * "БНХАУ-ын төрийн өмчит SAIC Motor". Demanding the form leaves
 * "Инновэйшн ХК" matching while those two do not.
 */
export function companyMatchTerms(
  symbol: string,
  name: string,
  distinctiveWords?: Set<string>,
): MatchTerm[] {
  const bare = bareName(name);
  const first = bare.split(/\s+/)[0] ?? "";
  const terms: MatchTerm[] = [symbol, bare, name].filter((t) => t.length >= 3);

  if (first && first !== bare && distinctiveWords?.has(first.toLowerCase())) {
    terms.push(
      new RegExp(
        `${escapeRegExp(first)}[^\\n.!?]{0,${NAME_TAIL_CHARS}}?(?:${COMPANY_FORMS})`,
        "i",
      ),
    );
  }
  return terms;
}

/** Headlines that name the company, deduplicated across all sources. */
export function matchHeadlines(
  results: NewsSourceResult[],
  terms: MatchTerm[],
): (NewsHeadline & { source: string })[] {
  // A name has to be a word, not a run of letters inside one. Three-letter
  // tickers are the problem: "АПУ" sits inside "Стартапуудад" and "Сүү"
  // inside "сүүлийн", and both filed unrelated stories under a company.
  // Mongolian separates the suffix from a company name with a space or a
  // hyphen — "Сүү ХК-ийн", "АПУ-гийн", "“Бодь даатгал” ХК" — so requiring
  // a non-letter on each side keeps the real mentions and drops the rest.
  const needles = terms
    .filter((t): t is string => typeof t === "string")
    .map(
      (t) =>
        new RegExp(
          `(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
          "iu",
        ),
    );
  const patterns = terms.filter((t): t is RegExp => t instanceof RegExp);
  const seen = new Set<string>();
  const matches: (NewsHeadline & { source: string })[] = [];

  for (const result of results) {
    if (result.status !== "ok") continue;
    const source = hostOf(result.url) ?? result.url;
    for (const headline of result.headlines) {
      const haystack = `${headline.title} ${headline.summary ?? ""}`;
      const named =
        needles.some((n) => n.test(haystack)) || patterns.some((p) => p.test(haystack));
      if (!named) continue;
      // Keyed by title as well as address: a Facebook page's posts share the
      // page's URL when no permalink is present, and keying on the URL alone
      // let one post stand for the whole page.
      const key = `${headline.url}|${headline.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ ...headline, source });
    }
  }
  return matches;
}
