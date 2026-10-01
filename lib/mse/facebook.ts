import type { Db } from "mongodb";
import * as cheerio from "cheerio";
import { ulaanbaatarDay, ulaanbaatarStamp, weekdayIndex } from "@/lib/day";

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
  /**
   * When it was posted, in Ulaanbaatar time: `YYYY-MM-DDTHH:MM:SS` where the
   * hour is known and `YYYY-MM-DD` where only the day is.
   *
   * The hour is what puts a page's posts in the order they were written.
   * Reduced to the day, every post a page made on Monday carries the same
   * stamp, and the feed — which sorts on this string — is left ordering them
   * by whatever order they happened to be fetched in.
   */
  date?: string;
}

/**
 * A moment as Ulaanbaatar states it, from an epoch or a parsed instant.
 * Returns nothing rather than "Invalid Date" for a stamp that did not parse.
 */
function stamp(at: Date): string | undefined {
  return Number.isNaN(at.getTime()) ? undefined : ulaanbaatarStamp(at);
}

/**
 * Epoch seconds or milliseconds as Ulaanbaatar time.
 *
 * Which of the two a scraper sends is not consistent — mbasic writes
 * seconds, Apify's `timestamp` has been seen as both — and telling them
 * apart on magnitude is safe for any date this app deals with: seconds
 * reach 1e12 in the year 33658.
 */
function fromEpoch(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return stamp(new Date(value < 1e12 ? value * 1000 : value));
}

/**
 * Newest post first, with undated ones last in the order they arrived.
 *
 * The routes disagree about order — the Graph API answers newest first,
 * mbasic's timeline mostly does, and a scraper run makes no promise at all —
 * and the posts are stored as they are returned here, so the order is worth
 * settling once, at the point the dates are known.
 */
function byNewest(a: FacebookPost, b: FacebookPost): number {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
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
 * "Yesterday") are rejected rather than guessed at, and so is the hour: the
 * page renders it in the reading account's own timezone, which is not stated
 * anywhere in the markup.
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
 * back to the written form. The epoch is preferred: it is unambiguous, it is
 * independent of the account's language, and it carries the hour — which the
 * written form states in whatever zone the account is set to, so its time is
 * dropped rather than filed under a zone it may not be in.
 */
function postDate($: cheerio.CheerioAPI, node: cheerio.Cheerio<never>): string | undefined {
  const abbr = node.find("abbr").first();
  const store = abbr.attr("data-store");
  if (store) {
    try {
      const time = JSON.parse(store)?.time;
      if (typeof time === "number") {
        const at = fromEpoch(time);
        if (at) return at;
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

  return posts.sort(byNewest);
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
const APIFY_RUNS_URL = `${APIFY_ACTOR_URL}/runs`;
const APIFY_RUN_API = "https://api.apify.com/v2/actor-runs";
const APIFY_DATASET_API = "https://api.apify.com/v2/datasets";

/**
 * How long starting a run waits for it to finish, in seconds.
 *
 * The run is started and left, not waited on to the end. A scrape is a real
 * browser run and usually outlasts any wait worth holding the news response
 * for, and this used to call the endpoint that waits for the dataset with a
 * twenty-five-second timeout: a run that went past it finished on Apify's
 * side, was paid for, and its posts were never collected — the only thing
 * that looked for them afterwards read the account's single latest run, and
 * only when the stored copy was empty. So a page that already had posts
 * kept those for good, and Facebook stopped arriving.
 *
 * Now the run's id is kept with the day's claim and every refresh after —
 * the five-minute one included — asks Apify how it went and collects it.
 * Reading a run and its dataset costs nothing. This wait only spares that
 * round trip for a run quick enough to finish while the request is open.
 */
const APIFY_WAIT_S = 20;
/** The start request: the wait above plus room for Apify to answer. */
const APIFY_TIMEOUT_MS = 30_000;

/**
 * Memory for each run, in megabytes.
 *
 * The actor defaults to 4096, and a free account may have 16384 running at
 * once — four runs. The weekday job starts every page together, so the
 * fifth to eighth were turned away with a 402 that was reported as the
 * month's allowance being spent, and their day's slot went with them. At
 * 2048 all eight fit; the actor's own minimum is 1024. A pay-per-post actor
 * bills by the post, not by the memory, so this changes nothing on the bill.
 */
const APIFY_MEMORY_MB = 2048;

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
 * No date filter. The actor now bills it as an add-on, $0.002 a post on the
 * free tier, which took five posts to $0.036 and eight pages a weekday past
 * the $5 allowance before the month was out. The feed already drops
 * anything older than its thirty-day window, so the filter bought nothing
 * that is not done here for free.
 */
const APIFY_POST_LIMIT = 5;

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
 * How many Facebook pages may be scraped in one day, and on which days.
 *
 * Eight pages every weekday is what the free allowance carries: five posts
 * a page costs about $0.026, and $5 a month is about a hundred and ninety
 * runs, which is eight pages across the month's twenty-odd trading days with
 * a little to spare. Before this the only thing holding the spend there was
 * the outside scheduler calling once a weekday — a second call on the same
 * day, a retry, a scheduler set up twice, and every page was scraped again.
 * Apify blocks the whole account when the allowance runs out, and every
 * source goes down with it.
 *
 * So the rule is in the code now:
 *
 *  - Monday to Friday only (Ulaanbaatar). The exchange is shut at weekends
 *    and the pages have nothing worth paying for.
 *  - Each page once a day. A second run for the same page on the same day
 *    is served what the first one stored.
 *  - At most eight different pages a day. A ninth is served its stored posts
 *    and says why, so a long list of pages cannot outspend the allowance.
 */
export const APIFY_PAGES_PER_DAY = 8;

/**
 * One page's run for one day: claimed, then started, then settled.
 *
 * A claim with no `runId` is a run the weekday job authorised and Apify has
 * not taken yet — it was busy — and any refresh that day may start it. One
 * with a `runId` and no `settledAt` is under way, and any refresh may collect
 * it. Settled is done with, posts or not.
 */
type RunClaim = {
  _id: string;
  day: string;
  pageUrl: string;
  at: Date;
  /** Set by whoever is starting the run, so two refreshes cannot both. */
  startingAt?: Date;
  runId?: string;
  datasetId?: string;
  startedAt?: Date;
  settledAt?: Date;
  /** What went wrong last, in the operator's language. */
  error?: string;
};

type DaySlots = { _id: string; used: number };

/**
 * One of the day's slots, if any are left.
 *
 * The update only matches while the count is under the cap; past it, the
 * upsert tries to insert the day again and hits its own `_id`. The same
 * duplicate is what two requests opening a new day together see, so on one
 * the count is read to tell which it was.
 */
async function takeSlot(db: Db, day: string): Promise<boolean> {
  const slots = db.collection<DaySlots>("apifyDays");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await slots.updateOne(
        { _id: day, used: { $lt: APIFY_PAGES_PER_DAY } },
        { $inc: { used: 1 } },
        { upsert: true },
      );
      return true;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const current = await slots.findOne({ _id: day });
      if (current && current.used >= APIFY_PAGES_PER_DAY) return false;
    }
  }
  return false;
}

/** Hands a claim back, slot and all, for a run that was never started. */
async function releaseClaim(db: Db, claim: RunClaim): Promise<void> {
  const removed = await db.collection<RunClaim>("apifyRuns").deleteOne({ _id: claim._id });
  if (removed.deletedCount === 1) {
    await db
      .collection<DaySlots>("apifyDays")
      .updateOne({ _id: claim.day, used: { $gt: 0 } }, { $inc: { used: -1 } });
  }
}

/**
 * Takes one of today's runs for this page, or says why it cannot.
 *
 * The claim is an insert on `_id` — day and page — which is unique whatever
 * indexes exist, so two requests arriving together cannot both start a run
 * for the same page. The day's slot is then taken off a counter that only
 * goes up while it is under the cap. This used to count the claims after
 * writing one and take it back if it was one too many, which let two pages
 * racing for the eighth slot both give it up — the weekday job starts every
 * page at once, so with nine pages that was the usual case, not a rare one.
 */
async function claimApifyRun(
  db: Db,
  pageUrl: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const day = ulaanbaatarDay(now);
  if (weekdayIndex(day) > 4) {
    return { ok: false, reason: "Амралтын өдөр Facebook шинээр татахгүй." };
  }
  const runs = db.collection<RunClaim>("apifyRuns");
  const _id = `${day}:${pageUrl}`;
  try {
    await runs.insertOne({ _id, day, pageUrl, at: now });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, reason: "Энэ хуудсыг өнөөдөр аль хэдийн татсан." };
    }
    throw err;
  }
  if (!(await takeSlot(db, day))) {
    await runs.deleteOne({ _id });
    return {
      ok: false,
      reason: `Өдрийн хязгаар (${APIFY_PAGES_PER_DAY} хуудас) хүрсэн — хадгалсан постыг харууллаа.`,
    };
  }
  return { ok: true };
}

/**
 * How recently a finished run must have ended for its dataset to be read
 * back instead of a scrape being started. A little over a day, so the run
 * this is looking for is the last weekday one.
 *
 * It is not how long stored posts stand — those stand until the next
 * weekday run replaces them, however long that takes. Expiring them would
 * mean the app either scraping off-schedule or showing no Facebook at all,
 * and the second is not better than posts that are a day older than usual.
 */
const CACHE_TTL_MS = 26 * 60 * 60 * 1000;

interface FacebookCache {
  key: string;
  posts: FacebookPost[];
  fetchedAt: Date;
  /**
   * When the free re-read below was last spent on these posts. Absent on a
   * snapshot that has never needed one.
   */
  recheckedAt?: Date;
}

async function readCache(db: Db, key: string): Promise<FacebookCache | null> {
  return db.collection<FacebookCache>("facebookSnapshots").findOne({ key });
}

async function writeCache(db: Db, key: string, posts: FacebookPost[]): Promise<void> {
  await db.collection<FacebookCache>("facebookSnapshots").updateOne(
    { key },
    {
      $set: { key, posts, fetchedAt: new Date() },
      // These posts are current, so any mark against the ones they replace
      // is spent on a question that is no longer being asked.
      $unset: { recheckedAt: "" },
    },
    { upsert: true },
  );
}

/** Records that the free look below has been taken for this page. */
async function markRechecked(db: Db, key: string): Promise<void> {
  await db
    .collection<FacebookCache>("facebookSnapshots")
    .updateOne({ key }, { $set: { recheckedAt: new Date() } });
}

/** Stored posts dated to the day and no further. */
function undated(posts: FacebookPost[]): boolean {
  return posts.length > 0 && posts.every((p) => !p.date || p.date.length <= 10);
}

/** How often a snapshot with no times may pay a free look for them. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Whether stored posts are worth reading back off the finished run.
 *
 * Snapshots written before the hour was kept carry a day and no more, and a
 * snapshot stands until the next weekday scrape replaces it — so over a
 * weekend the feed would spend three days with nothing to order a page's
 * posts by. {@link lastRunPosts} re-reads the dataset the last run already
 * produced, which spends no credits and touches nothing at facebook.com, and
 * the parser now takes the hour out of it.
 *
 * Bounded, because the last run is one run: where it was for another page
 * there is nothing to recover and asking again on every five-minute refresh
 * would be a pair of requests apiece, forever. One look every six hours,
 * until a scrape replaces the posts and settles it.
 */
function worthRechecking(cache: FacebookCache): boolean {
  if (!undated(cache.posts)) return false;
  const last = cache.recheckedAt?.getTime();
  return !last || Date.now() - last > RECHECK_MS;
}

interface ApifyPost {
  text?: string;
  /** ISO 8601, in UTC. */
  time?: string;
  /** Epoch, on the actor versions that send one. */
  timestamp?: number;
  url?: string;
  facebookUrl?: string;
  pageName?: string;
}

/**
 * When the actor says a post went out, in Ulaanbaatar time.
 *
 * The stamp it sends is UTC, and the feed states its own times locally —
 * taking the UTC digits as local dated an 09:30 post to 01:30 and sorted it
 * below everything published the evening before. The epoch is preferred
 * where the actor sends one; `time` parses to the same instant either way.
 */
function postedAt(post: ApifyPost): string | undefined {
  if (typeof post.timestamp === "number") {
    const at = fromEpoch(post.timestamp);
    if (at) return at;
  }
  return post.time ? stamp(new Date(post.time)) : undefined;
}

function toPosts(items: unknown): FacebookPost[] {
  return (Array.isArray(items) ? (items as ApifyPost[]) : [])
    .filter((p) => p.text?.trim())
    .map((p) => ({
      text: p.text!.replace(/\s+/g, " ").trim(),
      url: p.url,
      date: postedAt(p),
    }))
    .sort(byNewest);
}

/**
 * Results of the most recent successful run, if it was for this page and
 * recent enough to still be current.
 *
 * The account's latest run, not this page's: runs are tracked by their own
 * id now (see {@link advanceRun}), and this is what is left for a page with
 * nothing stored and no run on record — a fresh install, or posts stored
 * before the hour was kept.
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

/** A run as Apify describes it; only what is read here. */
interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId?: string;
}

/** Still going, so worth asking about again on the next refresh. */
function inProgress(status: string): boolean {
  return ["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(status);
}

type StartResult =
  | { kind: "started"; run: ApifyRun }
  /** Apify could not take it now; nothing was started or billed. */
  | { kind: "busy"; reason: string }
  /** Apify will not take it at all; nothing was started or billed. */
  | { kind: "refused"; reason: string };

const BUSY_NOTE = "Apify завгүй байна — дараагийн шинэчлэлтээр эхлүүлнэ.";
const RUNNING_NOTE = "Apify татаж байна — дуусмагц дараагийн шинэчлэлтээр гарна.";

/**
 * Asks Apify to start a run for one page, and waits a little for it.
 *
 * Throws when the request itself fails. Whether Apify took the run before the
 * answer was lost cannot be told from here, which is why the caller treats
 * that differently from a refusal.
 */
async function startRun(pageUrl: string, token: string): Promise<StartResult> {
  const request = (extras: boolean) => {
    const url = new URL(APIFY_RUNS_URL);
    url.searchParams.set("token", token);
    url.searchParams.set("waitForFinish", String(APIFY_WAIT_S));
    if (extras) {
      url.searchParams.set("memory", String(APIFY_MEMORY_MB));
      url.searchParams.set("maxTotalChargeUsd", String(APIFY_MAX_CHARGE_USD));
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls: [{ url: pageUrl }], resultsLimit: APIFY_POST_LIMIT }),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
  };

  // The memory and the charge cap are both documented on the run endpoint
  // but could not be tried against a real account here, so a rejection of
  // the request itself falls back to the same run without them. They are
  // the second line of defence; they must not become the reason Facebook
  // stops working.
  let res = await request(true);
  if (res.status === 400) res = await request(false);

  const body = (await res.json().catch(() => ({}))) as {
    data?: ApifyRun;
    error?: { message?: string; type?: string };
  };
  if (res.ok && body.data?.id) return { kind: "started", run: body.data };

  // Out of room for another run just now — memory or concurrency — which is
  // a 402 like the allowance running out, and was reported as that.
  const said = `${body.error?.type ?? ""} ${body.error?.message ?? ""}`;
  if (res.status === 429 || (res.status === 402 && /memory|concurren/i.test(said))) {
    return { kind: "busy", reason: BUSY_NOTE };
  }
  return {
    kind: "refused",
    reason:
      res.status === 401
        ? "Apify токен буруу байна."
        : res.status === 402
          ? "Apify-н үнэгүй эрх дууссан байна — дараа сар шинэчлэгдэнэ."
          : (body.error?.message ?? `Apify ${res.status}`),
  };
}

/** Where a run stands, or "gone" when Apify has no such run. Free. */
async function readRun(runId: string, token: string): Promise<ApifyRun | "gone" | null> {
  const res = await fetch(
    `${APIFY_RUN_API}/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (res.status === 404) return "gone";
  if (!res.ok) return null;
  return ((await res.json()) as { data?: ApifyRun }).data ?? null;
}

/** A finished run's posts, or null when the dataset could not be read. Free. */
async function readRunPosts(datasetId: string, token: string): Promise<FacebookPost[] | null> {
  const res = await fetch(
    `${APIFY_DATASET_API}/${encodeURIComponent(datasetId)}/items?clean=true&token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return null;
  return toPosts(await res.json());
}

/** Long enough for a start and its fallback to have answered or given up. */
const START_LOCK_MS = 2 * APIFY_TIMEOUT_MS + 10_000;

type RunStep =
  | { state: "none" }
  | { state: "waiting"; note: string }
  | { state: "done"; posts: FacebookPost[] }
  | { state: "failed"; error: string };

/**
 * Moves this page's open run one step on: starts it if Apify was busy when
 * it was authorised, collects it if it has finished since.
 *
 * Every refresh calls this, the five-minute one included, and none of it
 * spends anything beyond the run the weekday job already claimed: reading a
 * run and its dataset is free, and a run is only ever started against that
 * day's claim, once.
 */
async function advanceRun(
  db: Db,
  pageUrl: string,
  token: string,
  now: Date = new Date(),
): Promise<RunStep> {
  const runs = db.collection<RunClaim>("apifyRuns");
  const open = await runs.findOne(
    { pageUrl, settledAt: { $exists: false } },
    { sort: { at: -1 } },
  );
  if (!open) return { state: "none" };

  const settle = (error?: string) =>
    runs.updateOne(
      { _id: open._id },
      error ? { $set: { settledAt: now, error } } : { $set: { settledAt: now }, $unset: { error: "" } },
    );

  /** Reads a run that has stopped, keeping the claim open if it can't yet. */
  const collect = async (run: ApifyRun): Promise<RunStep> => {
    const datasetId = run.defaultDatasetId ?? open.datasetId;
    // A run that timed out or was stopped has still written — and billed —
    // whatever posts it got to, so those are read the same way.
    const posts = datasetId ? await readRunPosts(datasetId, token) : [];
    if (posts === null) return { state: "waiting", note: RUNNING_NOTE };
    if (posts.length === 0) {
      const error =
        run.status === "SUCCEEDED"
          ? "Apify хуудаснаас бичвэртэй пост олсонгүй."
          : `Apify run ${run.status} — пост ирсэнгүй.`;
      await settle(error);
      return { state: "failed", error };
    }
    await writeCache(db, `apify:${pageUrl}`, posts);
    await settle();
    return { state: "done", posts };
  };

  try {
    if (open.runId) {
      const run = await readRun(open.runId, token);
      if (run === "gone") {
        const error = "Apify run олдсонгүй.";
        await settle(error);
        return { state: "failed", error };
      }
      if (!run || inProgress(run.status)) return { state: "waiting", note: RUNNING_NOTE };
      return await collect(run);
    }

    // Authorised on a day that has gone. Today's weekday job claims afresh.
    if (open.day !== ulaanbaatarDay(now)) {
      await settle("Тэр өдөртөө эхэлж амжаагүй.");
      return { state: "none" };
    }

    // Only one refresh starts it, however many arrive together.
    const lock = await runs.updateOne(
      {
        _id: open._id,
        runId: { $exists: false },
        $or: [
          { startingAt: { $exists: false } },
          { startingAt: { $lt: new Date(now.getTime() - START_LOCK_MS) } },
        ],
      },
      { $set: { startingAt: now } },
    );
    if (lock.modifiedCount === 0) return { state: "waiting", note: RUNNING_NOTE };

    let started: StartResult;
    try {
      started = await startRun(pageUrl, token);
    } catch (err) {
      // The run may have been taken and the answer lost. Keeping the day's
      // slot spent is the side that can cost a day's posts; giving it back
      // is the side that can pay for the same page twice.
      const timeout = err instanceof Error && err.name === "TimeoutError";
      const error = timeout ? "Apify хугацаа хэтэрлээ." : `Apify: ${(err as Error).message}`;
      await settle(error);
      return { state: "failed", error };
    }

    if (started.kind === "busy") {
      await runs.updateOne(
        { _id: open._id },
        { $set: { error: started.reason }, $unset: { startingAt: "" } },
      );
      return { state: "waiting", note: started.reason };
    }
    if (started.kind === "refused") {
      // Nothing was started, so nothing was billed: the slot goes back.
      await releaseClaim(db, open);
      return { state: "failed", error: started.reason };
    }

    const { run } = started;
    await runs.updateOne(
      { _id: open._id },
      {
        $set: { runId: run.id, datasetId: run.defaultDatasetId, startedAt: now },
        $unset: { error: "" },
      },
    );
    if (inProgress(run.status)) return { state: "waiting", note: RUNNING_NOTE };
    return await collect(run);
  } catch (err) {
    // Apify or the database did not answer. The claim is left as it is and
    // the next refresh asks again.
    return { state: "waiting", note: `Apify: ${(err as Error).message}` };
  }
}

/**
 * Whether a Facebook read may scrape.
 *
 * `cached` the default, and what every path in the app gets bar one: never
 *          claim a run, whatever state the cache is in. It does move on a
 *          run the weekday job already claimed — collects it, or starts it
 *          if Apify was too busy to take it then — which spends nothing
 *          that job had not already decided to.
 * `fresh`  the weekday run at 12:45: spend the credits and take new posts.
 *
 * Two states rather than a scale, because the useful question is not how
 * stale a copy may be but how many runs a day this is worth, and the answer
 * is one. Facebook is billed per post against an allowance that has run out
 * mid-month before.
 *
 * There used to be a third, `stored`, which was the default: reuse the
 * stored posts and scrape only where there is nothing recent enough. It
 * reads as the cautious option and is not — it falls through to a billed run
 * as soon as the stored copy ages past its twenty-six hours. Seven callers
 * took that default, among them the home page when the feed is stale, the
 * daily sync, a company's news and the AI prompt, and the five-minute poll
 * of the free sources runs through the same code. One failed weekday run
 * would have left every one of them able to start a scrape.
 *
 * Only `app/api/news/refresh` returns `fresh`, and only for a caller that
 * has the cron secret and did not ask to skip Facebook. A scrape on demand
 * is that call, made by hand.
 */
export type FacebookSpend = "fresh" | "cached";

export async function fetchWithApify(
  pageUrl: string,
  token: string,
  db?: Db,
  spend: FacebookSpend = "cached",
): Promise<FacebookFetch> {
  const key = `apify:${pageUrl}`;
  const cached = db ? await readCache(db, key) : null;
  const stored = cached?.posts ?? [];

  // The weekday job: take this page's run for the day, if there is one to
  // take. Without a database there is nothing to count against, and an
  // uncounted run is exactly what the claim is there to prevent.
  let refusal: string | undefined;
  if (spend === "fresh") {
    if (!db) return { posts: stored, error: "Apify: тоолох сангүйгээр татахгүй." };
    const claim = await claimApifyRun(db, pageUrl);
    if (!claim.ok) refusal = claim.reason;
  }

  // A run this page is owed or already has under way. Every caller moves it
  // on — that is how a run which outlasted the weekday request still reaches
  // the feed, on the five-minute refresh after it finishes.
  if (db) {
    const step = await advanceRun(db, pageUrl, token);
    if (step.state === "done") return { posts: step.posts };
    // The stored posts stand meanwhile, at whatever age: the alternative is
    // not a newer answer but no Facebook in the feed at all.
    if (step.state === "waiting") return { posts: stored, error: step.note };
    if (step.state === "failed") return { posts: stored, error: step.error };
  }
  if (refusal) return { posts: stored, error: refusal };

  // Nothing under way: what is stored — unless it is a copy with no times on
  // it, or nothing at all, which is worth one free look at the account's
  // last finished run first. See {@link worthRechecking}.
  if (cached && stored.length > 0 && !worthRechecking(cached)) {
    return { posts: stored };
  }
  const recovered = await lastRunPosts(pageUrl, token);
  if (recovered) {
    if (db) await writeCache(db, key, recovered);
    return { posts: recovered };
  }
  if (db && cached) await markRechecked(db, key);
  return { posts: stored };
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

    // created_time carries its own offset ("+0000"), so it is an instant
    // rather than a local reading and is moved into Ulaanbaatar time like
    // every other stated hour in the feed.
    const posts = (body.data ?? [])
      .filter((p) => p.message?.trim())
      .map((p) => ({
        text: p.message!.replace(/\s+/g, " ").trim(),
        url: p.permalink_url,
        date: p.created_time ? stamp(new Date(p.created_time)) : undefined,
      }))
      .sort(byNewest);
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

export const __testing = {
  claimApifyRun, advanceRun, fetchWithApify, parseMbasicPosts, toPosts, byNewest, worthRechecking };
