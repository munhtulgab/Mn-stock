import type { Db } from "mongodb";
import { getSettings } from "@/lib/settings";
import { fetchNewsSources, type NewsHeadline } from "@/lib/mse/newsSources";
import { fetchExchangeNews } from "@/lib/mse/exchangeNews";
import type { Security } from "@/lib/types";

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
}

const WINDOW_DAYS = 30;

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

/** Mongolia is UTC+8 year round. */
const ULAANBAATAR_OFFSET_MS = 8 * 60 * 60 * 1000;

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
const SCHEMA_VERSION = 2;

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
      const key = `${headline.url}|${headline.title.slice(0, 80)}`;
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

  return items
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS);
}

/**
 * Reads the stored feed. Deliberately does no fetching: tapping the tab used
 * to wait on every configured site at once, which is what made the bar feel
 * stuck. {@link refreshMarketNews} does the work, from the background.
 */
export async function getMarketNews(db: Db): Promise<MarketNews> {
  // Resolved here rather than in the page: the window is defined by "now",
  // and a component that reads the clock while rendering is not idempotent.
  const local = new Date(Date.now() + ULAANBAATAR_OFFSET_MS);
  const days = {
    today: local.toISOString().slice(0, 10),
    yesterday: new Date(local.getTime() - 86_400_000).toISOString().slice(0, 10),
  };

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

/**
 * Rebuilds the feed: the exchange's own newsroom plus every configured site.
 * Slow by nature, so it runs from the refresh endpoint and the daily sync
 * rather than from a page render.
 */
export async function refreshMarketNews(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

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
        }).catch((err) => {
          console.error("news sources fetch failed", err);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const items = [
    // Exchange notices skip the relevance test — everything the exchange
    // publishes is market news by definition.
    ...exchange
      .filter((n) => n.date >= cutoff)
      .map((n) => ({
        title: n.title,
        url: n.url,
        source: "МХБ",
        date: n.date,
      })),
    ...collect(results, cutoff, symbols),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS);

  // A run that produced nothing is not an answer worth storing.
  if (items.length === 0) return 0;

  await db.collection<MarketNewsSnapshot>("marketNewsSnapshots").updateOne(
    { key: CACHE_KEY },
    {
      $set: {
        key: CACHE_KEY,
        items,
        computedAt: new Date(),
        schemaVersion: SCHEMA_VERSION,
      },
    },
    { upsert: true },
  );
  return items.length;
}
