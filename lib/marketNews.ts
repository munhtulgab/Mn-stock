import type { Db } from "mongodb";
import { getSettings } from "@/lib/settings";
import { fetchNewsSources, type NewsHeadline } from "@/lib/mse/newsSources";
import type { FacebookSpend } from "@/lib/mse/facebook";
import { fetchArticleTimes, fetchExchangeNews } from "@/lib/mse/exchangeNews";
import { todayAndYesterday, ulaanbaatarDaysAgo, ulaanbaatarTime } from "@/lib/day";
import { recordNotifications } from "@/lib/notifications";
import { sendPushToAll } from "@/lib/push";
import type { Security, User } from "@/lib/types";

/**
 * The market's news, rather than one company's.
 *
 * The company view asks "which of these name APU"; this one asks whether a
 * story is about the market at all. The publishers here are business titles
 * but not only that — the same front page carries a concert announcement and
 * a piece on tigers — so an item has to name a listed company or use the
 * vocabulary of trading to qualify.
 *
 * Items without a stated date are dropped: a thirty-day window cannot
 * honestly include something that might be from 2019.
 */

export interface MarketNewsItem {
  title: string;
  url: string;
  source: string;
  /** Local `YYYY-MM-DD[THH:MM:SS]`. */
  date: string;
  /**
   * When the feed first carried this story, as an ISO instant.
   *
   * Not the same thing as `date`: a publisher's date is the day it says the
   * story is from, which for a site that backfills can be a week before we
   * ever saw it. What counts as new to a reader is when it turned up here.
   */
  addedAt?: string;
}

export const WINDOW_DAYS = 30;

/**
 * What makes a story market news. Compounds rather than stems: "ашиг" alone
 * also matches "ашигт малтмал", and "санхүү" pulls in children's financial
 * literacy — measured against a live month of five sources.
 */
const MARKET_TERMS = [
  "хувьцаа",
  "арилжаа",
  "бирж",
  "МХБ",
  "индекс",
  "ТОП-20",
  "ногдол ашиг",
  "дивиденд",
  "IPO",
  "бонд",
  "ханш",
  "зах зээл",
  "ХК",
  "ХХК",
  "ББСБ",
  "Монголбанк",
  "хөрөнгө оруул",
  "хөрөнгийн зах",
  "үнэт цаас",
  "брокер",
  "капитал",
  "цэвэр ашиг",
  "ашигт ажиллагаа",
  "борлуулалтын орлого",
  "санхүүгийн тайлан",
  "санхүүгийн гүйцэтгэл",
  "санхүүгийн үзүүлэлт",
  "хувьцаат",
  "эзэмшигч",
  "бодлогын хүү",
  "инфляц",
  "зээлийн",
];

/**
 * Anchored at the front only. Mongolian glues its suffixes on — "арилжаа"
 * becomes "арилжааны" — so the end cannot be pinned, but the start still
 * keeps a term from matching inside an unrelated word.
 */
const MARKET_PATTERNS = MARKET_TERMS.map(
  (term) => new RegExp(`(?<![\\p{L}\\p{N}])${term}`, "iu"),
);

function isMarketRelated(text: string, symbols: Set<string>): boolean {
  if (MARKET_PATTERNS.some((p) => p.test(text))) return true;
  // A ticker on its own is enough: "SBM H1 | ..." names no other keyword.
  return (text.match(/\b[A-Z]{2,5}\b/g) ?? []).some((t) => symbols.has(t));
}

export interface MarketNews {
  items: MarketNewsItem[];
  /** Ulaanbaatar's today and yesterday, for "Өнөөдөр"/"Өчигдөр" headings. */
  today: string;
  yesterday: string;
  /**
   * True when the stored feed is old enough to be worth rebuilding. The page
   * shows what it has and refreshes behind it — building the feed means
   * fetching every configured site, which is far too long to hold a tab.
   */
  stale: boolean;
}

/** Enough to scroll for a while; beyond it the page is just weight. */
const MAX_ITEMS = 80;

const CACHE_KEY = "market";
const CACHE_MS = 30 * 60 * 1000;

/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 5;

interface MarketNewsSnapshot {
  key: string;
  schemaVersion?: number;
  items: MarketNewsItem[];
  computedAt: Date;
}

function withinWindow(date: string, from: string): boolean {
  return date.slice(0, 10) >= from;
}

function collect(
  results: { url: string; status: string; headlines: NewsHeadline[] }[],
  from: string,
  symbols: Set<string>,
): MarketNewsItem[] {
  const seen = new Set<string>();
  const items: MarketNewsItem[] = [];

  for (const result of results) {
    if (result.status !== "ok") continue;
    let source: string;
    try {
      source = new URL(result.url).hostname.replace(/^www\./, "");
    } catch {
      source = result.url;
    }

    for (const headline of result.headlines) {
      if (!headline.date || !withinWindow(headline.date, from)) continue;
      if (!isMarketRelated(`${headline.title} ${headline.summary ?? ""}`, symbols)) {
        continue;
      }
      // The same story syndicated twice is one story.
      const key = storyKey({ ...headline, source, date: headline.date });
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title: headline.title,
        url: headline.url,
        source,
        date: headline.date,
      });
    }
  }

  return items.sort(byNewest).slice(0, MAX_ITEMS);
}

/**
 * When a story counts as having appeared, for ordering.
 *
 * Its own stamp where it has one, and otherwise the moment the feed first
 * carried it — so a row with no stated hour still falls in a sensible place
 * among the rows that have one, instead of sinking to the foot of its day.
 */
function moment(item: MarketNewsItem): string {
  if (item.date.length > 10) return item.date;
  if (!item.addedAt) return item.date;
  const seen = new Date(item.addedAt);
  return Number.isNaN(seen.getTime())
    ? item.date
    : `${item.date.slice(0, 10)}T${ulaanbaatarTime(seen)}`;
}

function byNewest(a: MarketNewsItem, b: MarketNewsItem): number {
  return moment(b).localeCompare(moment(a));
}

/**
 * Reads the stored feed. Deliberately does no fetching: tapping the tab used
 * to wait on every configured site at once, which is what made the bar feel
 * stuck. {@link refreshMarketNews} does the work, from the background.
 */
export async function getMarketNews(db: Db): Promise<MarketNews> {
  // Resolved here rather than in the page: the window is defined by "now",
  // and a component that reads the clock while rendering is not idempotent.
  const days = todayAndYesterday();

  const cached = await db
    .collection<MarketNewsSnapshot>("marketNewsSnapshots")
    .findOne({ key: CACHE_KEY });

  const current =
    cached?.schemaVersion === SCHEMA_VERSION &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS;

  return {
    items: cached?.schemaVersion === SCHEMA_VERSION ? cached.items : [],
    stale: !current,
    ...days,
  };
}

export interface RefreshResult {
  /** Stories the feed now holds. */
  total: number;
  /** Of those, ones it did not hold before this run. */
  added: number;
}

/**
 * Rebuilds the feed: the exchange's own newsroom plus every configured site.
 * Slow by nature, so it runs from the refresh endpoint and the daily sync
 * rather than from a page render.
 *
 * Reports what arrived as well as what is held. "80 мэдээ" is the cap on how
 * many the feed keeps, the same number every run once the window is full,
 * and telling a reader who asked for a refresh that there are eighty stories
 * answers a question they did not ask.
 */
export async function refreshMarketNews(
  db: Db,
  /** What the Facebook sources may cost this run. See {@link FacebookSpend}. */
  options: { facebook?: FacebookSpend } = {},
): Promise<RefreshResult> {
  const cutoff = ulaanbaatarDaysAgo(WINDOW_DAYS);

  const cached = await db
    .collection<MarketNewsSnapshot>("marketNewsSnapshots")
    .findOne({ key: CACHE_KEY });

  const settings = await getSettings(db);
  const listed = await db
    .collection<Security>("securities")
    .find({}, { projection: { _id: 0, symbol: 1 } })
    .toArray();
  const symbols = new Set(listed.map((s) => s.symbol));

  // The exchange is a source in its own right and needs no configuring: it
  // publishes the daily trading report, listing decisions and dividend
  // notices, which is the core of what a market-news page is for.
  const [exchange, results] = await Promise.all([
    fetchExchangeNews(30).catch((err) => {
      console.error("exchange news fetch failed", err);
      return [];
    }),
    settings.newsSources.length > 0
      ? fetchNewsSources(settings.newsSources, {
          apifyToken: settings.apifyToken,
          facebookToken: settings.facebookToken,
          facebookCookie: settings.facebookCookie,
          db,
          extraCaCerts: settings.extraCaCerts,
          facebook: options.facebook,
        }).catch((err) => {
          console.error("news sources fetch failed", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const exchangeItems = exchange
    // Exchange notices skip the relevance test — everything the exchange
    // publishes is market news by definition.
    .filter((n) => n.date >= cutoff)
    .map((n) => ({
      title: n.title,
      url: n.url,
      source: "mse.mn",
      date: n.date,
    }));

  const fetched = [
    ...(await withStatedTimes(exchangeItems, cached)),
    ...collect(results, cutoff, symbols),
  ];

  // A run that was told not to read Facebook has not seen the whole feed, so
  // replacing the stored feed with what it fetched would drop every Facebook
  // story off the page until the next weekday run put them back. Merging
  // instead keeps them, and costs the frequent run nothing: a story it did
  // fetch wins over the stored copy of itself, and anything that has aged out
  // of the window is dropped here the same as it would have been.
  const items = (
    options.facebook === "cached"
      ? dedupe([...fetched, ...(cached?.items ?? [])]).filter(
          (item) => item.date >= cutoff,
        )
      : fetched
  )
    .sort(byNewest)
    .slice(0, MAX_ITEMS);

  // A run that produced nothing is not an answer worth storing.
  if (items.length === 0) return { total: 0, added: 0 };

  const stamped = stampArrivals(cached, items);
  const added = newStories(cached, items).length;
  await announce(db, cached, items);

  await db.collection<MarketNewsSnapshot>("marketNewsSnapshots").updateOne(
    { key: CACHE_KEY },
    {
      $set: {
        key: CACHE_KEY,
        items: stamped,
        computedAt: new Date(),
        schemaVersion: SCHEMA_VERSION,
      },
    },
    { upsert: true },
  );
  return { total: items.length, added };
}

/**
 * How many headlines are asked for their hour in one rebuild.
 *
 * The listing states a day and no more; the hour is only on the article, one
 * call each. In the steady state that is the handful published since the last
 * rebuild, because a stated time is carried across rebuilds like the arrival
 * stamp. The cap is a ceiling on a first build rather than a budget: the
 * listing itself only returns thirty, six go at a time, and the whole lot
 * costs a couple of seconds inside a rebuild that already takes forty.
 */
const TIME_LOOKUPS_PER_RUN = 30;

/** The article id out of `https://mse.mn/news/14850`. */
function articleId(url: string): number | null {
  const match = /\/news\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

/**
 * Fills in the hour each exchange notice went out.
 *
 * A time already known from a previous rebuild is reused; the newest of what
 * is left is asked for, up to the cap. Anything still without one falls back
 * to its arrival stamp when it is displayed and sorted.
 */
async function withStatedTimes(
  items: MarketNewsItem[],
  previous: MarketNewsSnapshot | null,
): Promise<MarketNewsItem[]> {
  const known = new Map(
    (previous?.items ?? [])
      .filter((item) => item.date.length > 10)
      .map((item) => [storyKey(item), item.date]),
  );

  const carried = items.map((item) => {
    const before = known.get(storyKey(item));
    return before ? { ...item, date: before } : item;
  });

  const wanted = carried
    .filter((item) => item.date.length === 10)
    .map((item) => articleId(item.url))
    .filter((id): id is number => id !== null)
    .slice(0, TIME_LOOKUPS_PER_RUN);
  if (wanted.length === 0) return carried;

  const times = await fetchArticleTimes(wanted).catch((err) => {
    console.error("article time lookup failed", err);
    return new Map<number, string>();
  });

  return carried.map((item) => {
    const id = articleId(item.url);
    const at = id === null ? undefined : times.get(id);
    return at ? { ...item, date: at } : item;
  });
}

/**
 * What makes two rows the same story: the link, plus enough of the headline
 * that a site reusing one URL for a live blog is not mistaken for a repeat.
 */
function storyKey(item: MarketNewsItem): string {
  return `${item.url}|${item.title.slice(0, 80)}`;
}

/** First copy of each story wins, so a fetched row beats a carried one. */
function dedupe(items: MarketNewsItem[]): MarketNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = storyKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Carries each story's arrival time across a rebuild.
 *
 * A story keeps the instant it first appeared; one that was not in the
 * previous feed is arriving now. The very first build stamps everything at
 * once, which is correct and harmless: nobody has a last-visit to compare it
 * against yet.
 */
function stampArrivals(
  previous: MarketNewsSnapshot | null,
  items: MarketNewsItem[],
): MarketNewsItem[] {
  const known = new Map(
    (previous?.items ?? []).map((item) => [storyKey(item), item.addedAt]),
  );
  const now = new Date().toISOString();
  return items.map((item) => ({
    ...item,
    addedAt: known.get(storyKey(item)) ?? now,
  }));
}

/**
 * Stories this run brought in.
 *
 * Matched on the same key the feed dedupes by, so the same story arriving
 * from a second publisher is not counted twice. A first build has nothing to
 * compare against and brings in nothing: thirty days of headlines are the
 * archive, not an update.
 */
function newStories(
  previous: MarketNewsSnapshot | null,
  items: MarketNewsItem[],
): MarketNewsItem[] {
  if (!previous || previous.items.length === 0) return [];
  const known = new Set(previous.items.map(storyKey));
  return items.filter((item) => !known.has(storyKey(item)));
}

/** Headlines to name in one push before it becomes a list nobody reads. */
const ANNOUNCE_LIMIT = 5;

/**
 * Tells the reader what has just been published.
 *
 * A story is new if it was not in the feed last time this ran — matched on
 * the same key the feed dedupes by, so the same story arriving from a second
 * publisher is not announced twice. The very first build announces nothing:
 * thirty days of headlines are not news to somebody opening the app.
 */
async function announce(
  db: Db,
  previous: MarketNewsSnapshot | null,
  items: MarketNewsItem[],
): Promise<void> {
  const fresh = newStories(previous, items);
  if (fresh.length === 0) return;

  await recordNotifications(
    db,
    fresh.slice(0, ANNOUNCE_LIMIT).map((item) => ({
      title: item.title,
      body: `${item.source} · ${item.date.slice(0, 10)}`,
      url: item.url,
      kind: "news" as const,
    })),
  );

  const { notifications } = await getSettings(db);
  if (!notifications.pushEnabled) return;

  const [first] = fresh;
  await sendPushToAll(db, {
    title:
      fresh.length === 1
        ? "Шинэ мэдээ"
        : `${fresh.length} шинэ мэдээ`,
    body: first.title.slice(0, 120),
    url: "/news",
    tag: "mse-market-news",
  }).catch((err) => {
    console.error("news push failed", err);
    return null;
  });
}

/**
 * How many stories have arrived since the reader last opened the page.
 *
 * The page used to head itself "80 мэдээ", which was the cap on how many the
 * feed keeps rather than anything that had happened — the same number every
 * day once the window was full. What a reader wants to know is what is new
 * since they last looked.
 *
 * A reader who has never opened the page has nothing new: thirty days of
 * headlines are the archive, not an update.
 */
export function countNewSince(
  items: MarketNewsItem[],
  seenAt: Date | undefined,
): number {
  if (!seenAt) return 0;
  const since = seenAt.toISOString();
  return items.filter((item) => item.addedAt && item.addedAt > since).length;
}

/** Records that the reader has now seen the feed as it stands. */
export async function markNewsSeen(db: Db, userId: string): Promise<void> {
  await db
    .collection<User>("users")
    .updateOne({ _id: userId } as never, { $set: { newsSeenAt: new Date() } });
}
