import type { Db } from "mongodb";
import * as cheerio from "cheerio";

/**
 * Reading a saved Facebook page.
 *
 * Facebook has no anonymous read path. Every entry point — www, m, touch,
 * mbasic, the page plugin — either redirects to /login or returns a shell
 * that fills itself in with JavaScript. The free public bridges that used to
 * paper over this no longer do either: RSSHub answers a Cloudflare challenge,
 * and four RSS-Bridge instances all fail at Facebook itself ("Unable to find
 * anything useful", "Unable to get the page id"). Three routes remain:
 *
 *   a scraping API, which needs only a free key and no account of one's own,
 *   a session cookie, which reads any page the account can see, and
 *   a Graph API token, which reads only pages the token was issued for.
 *
 * They are tried in that order — cheapest thing to set up first, and the one
 * that puts nothing of the operator's own at risk.
 */

const MBASIC = "https://mbasic.facebook.com";
const TIMEOUT_MS = 15_000;

/**
 * mbasic's own mobile agent. Sending a desktop Chrome string to mbasic gets
 * the request bounced to the JavaScript site.
 */
const MBASIC_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Mobile Safari/537.36";

/**
 * The cookies a Facebook session actually needs. Operators paste whatever
 * `document.cookie` gave them, which includes ad and experiment identifiers
 * that serve no purpose here — storing those would be keeping more of
 * someone's account than the job requires.
 */
const SESSION_COOKIES = ["c_user", "xs", "datr", "sb", "fr"];

/**
 * Reduces a pasted cookie string to the session pair and its companions.
 * Returns "" when the essential pair is missing, so a half-copied paste is
 * rejected at the point it is entered rather than at the next fetch.
 */
export function normaliseCookie(raw: string): string {
  const pairs = new Map<string, string>();
  for (const part of raw.split(/[;\n]/)) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (value && SESSION_COOKIES.includes(name)) pairs.set(name, value);
  }
  if (!pairs.has("c_user") || !pairs.has("xs")) return "";
  return SESSION_COOKIES.filter((n) => pairs.has(n))
    .map((n) => `${n}=${pairs.get(n)}`)
    .join("; ");
}

export interface FacebookPost {
  text: string;
  /** Post permalink, when one is present in the markup. */
  url?: string;
  /** YYYY-MM-DD, when the timestamp could be read. */
  date?: string;
}

/**
 * Path segments that are Facebook's own routing rather than a page name.
 * "share" is the one the app's share sheet produces, and every such link
 * begins with it — so it identifies no page at all.
 */
const ROUTING_SEGMENTS = ["share", "groups", "watch", "photo", "events", "reel"];

/** The page name in a facebook.com URL: profile.php ids included. */
export function pageSlug(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const id = parsed.searchParams.get("id");
  if (parsed.pathname.startsWith("/profile.php") && id) return `profile.php?id=${id}`;

  const parts = parsed.pathname.split("/").filter(Boolean);
  const segment = parts[0];
  if (!segment) return null;
  // "people", "pages" and "pg" prefix the real name in older link formats.
  if (["pages", "pg", "people"].includes(segment.toLowerCase())) {
    return parts[parts.length - 1] ?? null;
  }
  // A share link names no page, so the whole path is its identity. Returning
  // "share" for all of them made eleven different sources look like one.
  if (ROUTING_SEGMENTS.includes(segment.toLowerCase())) {
    return parts.join("/");
  }
  return segment;
}

/** Comparable form of a page address: no scheme, no www, no query. */
function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`
      .toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Facebook redirects an unauthenticated reader here. */
function isLoginWall(finalUrl: string, html: string): boolean {
  if (/\/(login|checkpoint|recover)(\.php|\/|\?|$)/i.test(finalUrl)) return true;
  return /name="pass"|id="login_form"|Log into Facebook|Нэвтрэх/i.test(html)
    && !/data-ft=/.test(html);
}

/**
 * Facebook footer furniture that appears inside every post container and is
 * not part of what was written.
 */
const CHROME = new RegExp(
  [
    "Like",
    "Comment",
    "Share",
    "Full Story",
    "See more",
    "See More",
    "View more comments",
    "Таалагдсан",
    "Сэтгэгдэл",
    "Хуваалцах",
    "Бүтнээр нь харах",
    "Цааш үзэх",
  ].join("|"),
  "g",
);

/**
 * A written-out post date: "5 August at 10:03", "August 5 at 10:03", either
 * with a year once the post is old enough. Relative forms ("2 hrs",
 * "Yesterday") are rejected rather than guessed at.
 *
 * The year is omitted for anything inside the last twelve months, and
 * Date.parse fills that gap with 2001 — which is how "4 August at 16:20"
 * became 2001-08-04.
 */
function parseAbbrDate(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").replace(/\bat\b/i, "").trim();
  const dayFirst = /^(\d{1,2}) ([A-Za-z]{3,}) ?(\d{4})?/.exec(clean);
  const monthFirst = /^([A-Za-z]{3,}) (\d{1,2})(?:,)? ?(\d{4})?/.exec(clean);

  let day: string, month: string, year: string | undefined;
  if (dayFirst) {
    [, day, month, year] = dayFirst;
  } else if (monthFirst) {
    [, month, day, year] = monthFirst;
  } else {
    return undefined;
  }

  const now = new Date();
  const stamp = Date.parse(`${month} ${day}, ${year ?? now.getUTCFullYear()} 00:00:00Z`);
  if (!Number.isFinite(stamp)) return undefined;

  // A year-less date that lands ahead of today belongs to last year.
  const date = new Date(stamp);
  if (!year && date.getTime() > now.getTime() + 86_400_000) {
    date.setUTCFullYear(date.getUTCFullYear() - 1);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * mbasic writes an epoch into the post's own <abbr data-store> and falls
 * back to the written form. The epoch is preferred: it is unambiguous and
 * independent of the account's language.
 */
function postDate($: cheerio.CheerioAPI, node: cheerio.Cheerio<never>): string | undefined {
  const abbr = node.find("abbr").first();
  const store = abbr.attr("data-store");
  if (store) {
    try {
      const time = JSON.parse(store)?.time;
      if (typeof time === "number" && time > 0) {
        return new Date(time * 1000).toISOString().slice(0, 10);
      }
    } catch {
      // Fall through to the text form.
    }
  }
  return parseAbbrDate(abbr.text());
}

/** Like, comment, share and reaction links carry the post id too. */
function isActionLink(href: string): boolean {
  return /^\/a\/|like\.php|comment\.php|share|reactions|ufi\//i.test(href);
}

function postUrl($: cheerio.CheerioAPI, node: cheerio.Cheerio<never>): string | undefined {
  let href: string | undefined;
  for (const selector of [
    'a[href*="story.php?story_fbid="]',
    'a[href*="/posts/"]',
    'a[href*="permalink.php"]',
    'a[href*="story_fbid"]',
  ]) {
    node.find(selector).each((_, el) => {
      const candidate = $(el).attr("href");
      if (!href && candidate && !isActionLink(candidate)) href = candidate;
    });
    if (href) break;
  }
  if (!href) return undefined;

  try {
    // mbasic links carry tracking parameters that make the same post look
    // like several different ones.
    const abs = new URL(href, MBASIC);
    abs.hostname = "www.facebook.com";
    for (const param of ["refid", "__tn__", "_ft_", "eav", "rdid", "ref"]) {
      abs.searchParams.delete(param);
    }
    return abs.toString();
  } catch {
    return undefined;
  }
}

/** Long enough to be a statement rather than a caption or a button. */
const MIN_POST_CHARS = 40;

/**
 * Posts from an mbasic page timeline.
 *
 * Post containers carry a `data-ft` attribute holding JSON with
 * `top_level_post_id` — the one stable hook in markup whose class names are
 * obfuscated and rotate. Everything else here is defensive: containers that
 * hold no prose, or that repeat a post already seen, are dropped.
 */
function parseMbasicPosts(html: string): FacebookPost[] {
  const $ = cheerio.load(html);
  const posts: FacebookPost[] = [];
  const seen = new Set<string>();

  $("[data-ft]").each((_, el) => {
    const node = $(el) as unknown as cheerio.Cheerio<never>;
    const ft = $(el).attr("data-ft") ?? "";
    if (!/top_level_post_id/.test(ft)) return;
    // Nested containers repeat their parent's data-ft; keep the outermost.
    if ($(el).parents("[data-ft]").filter((_, p) => /top_level_post_id/.test($(p).attr("data-ft") ?? "")).length) {
      return;
    }

    const text = node
      .text()
      .replace(CHROME, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < MIN_POST_CHARS) return;

    const key = text.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);

    posts.push({ text, url: postUrl($, node), date: postDate($, node) });
  });

  return posts;
}

export interface FacebookFetch {
  posts: FacebookPost[];
  /** Set when the read failed, in the operator's language. */
  error?: string;
  /** True when Facebook answered with its login wall. */
  loginWall?: boolean;
  /** For the settings diagnostic: what actually came back. */
  status?: number;
  finalUrl?: string;
  bytes?: number;
}

/**
 * Reads a page's recent posts with the operator's session cookie.
 *
 * The cookie is sent to facebook.com and nowhere else. Locale is pinned to
 * en_US so timestamps come back in a form that parses, whatever language the
 * account is set to.
 */
export async function fetchWithCookie(
  pageUrl: string,
  cookie: string,
): Promise<FacebookFetch> {
  const slug = pageSlug(pageUrl);
  if (!slug) {
    return { posts: [], error: "Facebook хуудасны нэрийг линкээс уншиж чадсангүй." };
  }

  // A share link has no page name to rebuild from, so its own path is used
  // and mbasic follows the redirect.
  const target = slug.includes("profile.php?id=")
    ? `${MBASIC}/${slug}&locale=en_US&v=timeline`
    : slug.includes("/")
      ? `${MBASIC}/${slug}?locale=en_US`
      : `${MBASIC}/${encodeURIComponent(slug)}?locale=en_US&v=timeline`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": MBASIC_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: cookie,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await res.text();
    const meta = { status: res.status, finalUrl: res.url, bytes: html.length };

    if (isLoginWall(res.url, html)) {
      return {
        ...meta,
        posts: [],
        loginWall: true,
        error:
          "Facebook cookie хүчингүй болсон эсвэл дууссан байна — Тохиргоо дотор шинээр хуулж тавина уу.",
      };
    }
    if (!res.ok) {
      return { ...meta, posts: [], error: `Facebook ${res.status}.` };
    }

    const posts = parseMbasicPosts(html);
    if (posts.length === 0) {
      return {
        ...meta,
        posts: [],
        error: "Хуудас нээгдсэн ч бичвэртэй пост олдсонгүй.",
      };
    }
    return { ...meta, posts };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      posts: [],
      error: timeout ? "Facebook хугацаа хэтэрлээ." : `Facebook: ${(err as Error).message}`,
    };
  }
}

/**
 * apify.com's Facebook posts scraper, which does the awkward part on its own
 * infrastructure and hands back JSON. A free account carries a monthly credit
 * allowance and needs no card, so this is the least troublesome way in — and
 * unlike a cookie it exposes no account of the operator's.
 */
const APIFY_ACTOR = "apify~facebook-posts-scraper";
const APIFY_ACTOR_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR}`;
const APIFY_RUN_URL = `${APIFY_ACTOR_URL}/run-sync-get-dataset-items`;

/**
 * A scrape is a real browser run and often outlasts this, which is fine:
 * the run finishes on Apify's side and {@link lastRunPosts} collects it on
 * the next request. What is not fine is holding the news response until it
 * does — every source is fetched together, so a single slow scrape can push
 * the whole request past its limit and lose every other site's headlines
 * along with it.
 */
const APIFY_TIMEOUT_MS = 25_000;

/**
 * How much history is worth paying credits for.
 *
 * The actor charges per post written, not per run: on the free tier a post
 * costs $0.005 and starting a run costs $0.001, so twenty posts came to
 * $0.101 a page every time this refreshed. Against a $5 monthly allowance
 * that is forty-nine refreshes — one Facebook page fits comfortably, two
 * only just, and three run the account dry three quarters of the way
 * through the month. Apify blocks the whole account when the allowance is
 * gone, so the page that overspent takes the others down with it.
 *
 * Five posts costs $0.026, which is a hundred and ninety refreshes — eight
 * pages every weekday inside the free tier. It is enough for what these are
 * read for: a daily refresh only needs what was published since yesterday,
 * and the prompt they feed truncates the lot to three thousand characters
 * anyway.
 *
 * The thirty-day window stays as it is. It does not add to the bill — the
 * limit above caps what can be charged — and narrowing it would return
 * nothing at all for a page that posts rarely, which costs a run and gets no
 * posts to cache, so the next request pays to ask again.
 */
const APIFY_POST_LIMIT = 5;
const APIFY_MAX_AGE_DAYS = 30;

/**
 * A hard ceiling on one run, in dollars, sent with the request.
 *
 * Belt as well as braces: `resultsLimit` is the actor being asked for five
 * posts, this is Apify being told to stop billing past what five posts and a
 * start cost. An actor that ignored the limit — a change at their end, a
 * page that paginates oddly — could otherwise spend a month's allowance in a
 * single run, and the first anyone would know is every source failing.
 */
const APIFY_MAX_CHARGE_USD = 0.04;

/**
 * How long a scrape stands. Long, because it costs credits: the scheduled
 * refresh takes one set of posts each weekday and everything else — company
 * pages, the market feed, the AI prompt — reads that. The window is a little
 * over a day so a missed run degrades to a second fetch rather than to
 * silence.
 */
const CACHE_TTL_MS = 26 * 60 * 60 * 1000;

interface FacebookCache {
  key: string;
  posts: FacebookPost[];
  fetchedAt: Date;
}

async function readCache(db: Db, key: string): Promise<FacebookCache | null> {
  return db.collection<FacebookCache>("facebookSnapshots").findOne({ key });
}

async function writeCache(db: Db, key: string, posts: FacebookPost[]): Promise<void> {
  await db
    .collection<FacebookCache>("facebookSnapshots")
    .updateOne({ key }, { $set: { key, posts, fetchedAt: new Date() } }, { upsert: true });
}

interface ApifyPost {
  text?: string;
  time?: string;
  url?: string;
  facebookUrl?: string;
  pageName?: string;
}

function toPosts(items: unknown): FacebookPost[] {
  return (Array.isArray(items) ? (items as ApifyPost[]) : [])
    .filter((p) => p.text?.trim())
    .map((p) => ({
      text: p.text!.replace(/\s+/g, " ").trim(),
      url: p.url,
      date: p.time?.slice(0, 10),
    }));
}

/**
 * Results of the most recent successful run, if it was for this page and
 * recent enough to still be current.
 *
 * A run outlives the request that started it: when a scrape takes longer
 * than the caller can wait, it finishes on Apify's side anyway and the
 * credits are already spent. Reading it back on the next attempt collects
 * results that would otherwise be paid for and thrown away.
 */
async function lastRunPosts(
  pageUrl: string,
  token: string,
): Promise<FacebookPost[] | null> {
  const auth = `token=${encodeURIComponent(token)}&status=SUCCEEDED`;
  try {
    const runRes = await fetch(`${APIFY_ACTOR_URL}/runs/last?${auth}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!runRes.ok) return null;
    const run = (await runRes.json()) as { data?: { finishedAt?: string } };
    const finishedAt = Date.parse(run.data?.finishedAt ?? "");
    if (!Number.isFinite(finishedAt) || Date.now() - finishedAt > CACHE_TTL_MS) {
      return null;
    }

    const itemsRes = await fetch(`${APIFY_ACTOR_URL}/runs/last/dataset/items?${auth}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!itemsRes.ok) return null;
    const items = (await itemsRes.json()) as ApifyPost[];

    // The last run was very likely for a different page, so this has to be
    // exact. A substring test against the slug reused one page's posts for
    // every share link in the source list, because they all begin "/share/".
    const wanted = canonicalUrl(pageUrl);
    const slug = pageSlug(pageUrl)?.toLowerCase();
    const matches = items.some(
      (p) =>
        (p.facebookUrl ? canonicalUrl(p.facebookUrl) === wanted : false) ||
        (!!slug && !slug.includes("/") && p.pageName?.toLowerCase() === slug),
    );
    if (!matches) return null;

    const posts = toPosts(items);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

/**
 * What a Facebook read is allowed to cost.
 *
 * `fresh`  the weekday run: spend the credits and take new posts.
 * `stored` a reader's tab: reuse the stored posts, and scrape only when there
 *          is nothing stored recent enough to reuse.
 * `cached` the frequent run: never scrape, whatever state the cache is in.
 *
 * The third exists because the other sources are free to read and are polled
 * every few minutes, while Facebook is billed per post. `stored` is not
 * enough on its own to keep that apart: it falls through to a billed run
 * once the stored copy ages past its window, so a cache that went cold —
 * one failed weekday run — would turn every poll after it into a scrape and
 * spend the month's allowance a few minutes at a time.
 */
export type FacebookSpend = "fresh" | "stored" | "cached";

export async function fetchWithApify(
  pageUrl: string,
  token: string,
  db?: Db,
  spend: FacebookSpend = "stored",
): Promise<FacebookFetch> {
  const key = `apify:${pageUrl}`;
  const cached = db ? await readCache(db, key) : null;
  if (spend !== "fresh" && cached) {
    const current = Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;
    // Asked for cached-only, the stored posts stand at whatever age they
    // have: the alternative is not a newer answer but no Facebook in the
    // feed until the next weekday run, and a post does not stop having been
    // published because the copy of it is a day older than usual.
    if (current || spend === "cached") return { posts: cached.posts };
  }

  const recovered = spend === "fresh" ? null : await lastRunPosts(pageUrl, token);
  if (recovered) {
    if (db) await writeCache(db, key, recovered);
    return { posts: recovered };
  }

  // Nothing stored and nothing to read back off a finished run. A read that
  // is not allowed to scrape stops here rather than starting a billed one.
  if (spend === "cached") return { posts: [] };

  const since = new Date(Date.now() - APIFY_MAX_AGE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    const start = (capped: boolean) => {
      const run = new URL(APIFY_RUN_URL);
      run.searchParams.set("token", token);
      if (capped) run.searchParams.set("maxTotalChargeUsd", String(APIFY_MAX_CHARGE_USD));
      return fetch(run, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: pageUrl }],
          resultsLimit: APIFY_POST_LIMIT,
          onlyPostsNewerThan: since,
        }),
        signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      });
    };

    // The cap is documented on the run endpoint but could not be tried
    // against a real account here, so a rejection of the request itself
    // falls back to the same run without it. The limit above is what keeps
    // the bill down; this is only the second line of defence, and it must
    // not become the reason Facebook stops working.
    let res = await start(true);
    if (res.status === 400) res = await start(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; type?: string };
      };
      // 402 is the free allowance being spent, which is worth saying plainly
      // rather than reporting as a generic failure.
      const message =
        res.status === 401
          ? "Apify токен буруу байна."
          : res.status === 402
            ? "Apify-н үнэгүй эрх дууссан байна — дараа сар шинэчлэгдэнэ."
            : (body.error?.message ?? `Apify ${res.status}`);
      return { posts: cached?.posts ?? [], error: message, status: res.status };
    }

    const posts = toPosts(await res.json());
    if (posts.length === 0) {
      return {
        posts: cached?.posts ?? [],
        error: "Apify хуудаснаас бичвэртэй пост олсонгүй.",
      };
    }

    if (db) await writeCache(db, key, posts);
    return { posts };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      // A scrape that ran long doesn't invalidate what it returned last time.
      posts: cached?.posts ?? [],
      error: timeout
        ? "Apify хугацаа хэтэрлээ — дараагийн оролдлогод амжина."
        : `Apify: ${(err as Error).message}`,
    };
  }
}

/**
 * Reads the same posts through the Graph API. Works only for pages the token
 * was issued for, which is why it is the fallback rather than the main path.
 */
export async function fetchWithToken(
  pageUrl: string,
  token: string,
): Promise<FacebookFetch> {
  const slug = pageSlug(pageUrl);
  if (!slug) return { posts: [], error: "Facebook хуудасны нэрийг линкээс уншиж чадсангүй." };

  try {
    const api = new URL(`https://graph.facebook.com/v21.0/${slug}/posts`);
    api.searchParams.set("fields", "message,created_time,permalink_url");
    api.searchParams.set("limit", "25");
    api.searchParams.set("access_token", token);

    const res = await fetch(api, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { message?: string; created_time?: string; permalink_url?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { posts: [], error: `Facebook: ${body.error?.message ?? `Graph API ${res.status}`}` };
    }

    const posts = (body.data ?? [])
      .filter((p) => p.message?.trim())
      .map((p) => ({
        text: p.message!.replace(/\s+/g, " ").trim(),
        url: p.permalink_url,
        date: p.created_time?.slice(0, 10),
      }));
    return posts.length > 0
      ? { posts }
      : { posts: [], error: "Facebook хуудсанд бичвэртэй пост олдсонгүй." };
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      posts: [],
      error: timeout ? "Facebook хугацаа хэтэрлээ." : `Facebook: ${(err as Error).message}`,
    };
  }
}
