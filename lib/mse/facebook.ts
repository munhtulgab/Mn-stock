import * as cheerio from "cheerio";

/**
 * Reading a saved Facebook page.
 *
 * Facebook has no anonymous read path. Every entry point — www, m, touch,
 * mbasic, the page plugin — either redirects to /login or returns a shell
 * that fills itself in with JavaScript, so a server-side fetch sees a login
 * form and nothing else. Two things get past that:
 *
 *   a session cookie, which reads any page the account can see, and
 *   a Graph API token, which reads only pages the token was issued for.
 *
 * The cookie is what makes an ordinary saved page work, so it is tried
 * first. It is read against mbasic.facebook.com: the no-JavaScript version
 * renders posts as plain server-side HTML, which is both parseable and a
 * fraction of the bytes.
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

  const segment = parsed.pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  // "people", "pages" and "pg" prefix the real name in older link formats.
  if (["pages", "pg", "people"].includes(segment.toLowerCase())) {
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  }
  return segment;
}

/** Facebook redirects an unauthenticated reader here. */
export function isLoginWall(finalUrl: string, html: string): boolean {
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
export function parseAbbrDate(text: string): string | undefined {
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
export function parseMbasicPosts(html: string): FacebookPost[] {
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

  const target = slug.includes("profile.php?id=")
    ? `${MBASIC}/${slug}&locale=en_US&v=timeline`
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
