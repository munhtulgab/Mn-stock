import type { Db } from "mongodb";
import {
  fetchExchangeArticle,
  type ArticleBlock,
} from "@/lib/mse/exchangeNews";
import { mondayOf, shiftDays } from "@/lib/day";
import type { MarketNewsItem } from "@/lib/marketNews";

/**
 * The exchange's own trading reports, read rather than linked to.
 *
 * Two of the things it publishes are reports rather than announcements: the
 * daily one — how many companies rose, which moved furthest, what the bond
 * and mining sessions did — and the weekly review, which is the same in
 * tables. Both were in the news list as headlines that led away to mse.mn,
 * which is a poor place to leave the one item on the page that answers "what
 * happened today".
 *
 * A period is rarely one article: the day the trading report comes out is
 * usually also the day the primary bond auction is reported, and both belong
 * beside the day's figures. So each period is a small set, in the order they
 * should be read, with the report itself first.
 *
 * An article's body is a second call, so it is fetched once when the article
 * first appears and kept: the exchange does not revise these.
 */

export interface TradeReport {
  id: number;
  title: string;
  /** YYYY-MM-DD as the exchange stated it. */
  date: string;
  url: string;
  body: ArticleBlock[];
}

export interface TradeReports {
  /** The last session's articles, its trading report first. */
  daily: TradeReport[];
  /** The reviewed week's articles, the review first. */
  weekly: TradeReport[];
}

/**
 * Titled "8 ДУГААР САРЫН 5-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ" and "ДОЛОО ХОНОГИЙН
 * АРИЛЖААНЫ ТОЙМ МЭДЭЭ". Matched on the part that does not change, so the
 * date in the daily one is not something the pattern has to know about.
 */
const PATTERNS = {
  daily: /ӨДРИЙН\s+АРИЛЖААНЫ\s+МЭДЭЭ/i,
  weekly: /ДОЛОО\s+ХОНОГИЙН\s+АРИЛЖААНЫ\s+ТОЙМ/i,
} as const;

/** Enough for a period to have more than one side; past it, it is a feed. */
const PER_PERIOD = 3;

const SNAPSHOT_KEY = "tradeReports";
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 2;

/**
 * How long a page render will wait for articles it has not read before.
 * Past it the page shows the reports it already had — a day-old report beats
 * a page that hangs on the exchange being slow.
 */
const FETCH_BUDGET_MS = 4_000;

/**
 * How long an article that could not be read is left alone.
 *
 * Without it, an exchange that is down costs every single page render the
 * budget above, because nothing was stored to say the attempt had been made.
 */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const failedAt = new Map<number, number>();

interface ReportSnapshot {
  key: string;
  schemaVersion?: number;
  reports: TradeReports;
  computedAt: Date;
}

/** The article id out of `https://mse.mn/news/14850`. */
function articleId(url: string): number | null {
  const match = /\/news\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

/** Only the exchange's own copy carries a body we can read. */
function exchangeItems(items: MarketNewsItem[]): MarketNewsItem[] {
  return items.filter((item) => item.source === "mse.mn");
}

function idsOf(items: MarketNewsItem[]): number[] {
  return items
    .map((item) => articleId(item.url))
    .filter((id): id is number => id !== null)
    .slice(0, PER_PERIOD);
}

/** The last session's trading report, and whatever else it was published with. */
function selectDaily(items: MarketNewsItem[]): number[] {
  const feed = exchangeItems(items);
  const lead = feed.find((item) => PATTERNS.daily.test(item.title));
  if (!lead) return [];
  const day = lead.date.slice(0, 10);
  return idsOf([
    lead,
    ...feed.filter((item) => item !== lead && item.date.slice(0, 10) === day),
  ]);
}

/** The weekly review, and the week's other news — minus its daily reports. */
function selectWeekly(items: MarketNewsItem[]): number[] {
  const feed = exchangeItems(items);
  const lead = feed.find((item) => PATTERNS.weekly.test(item.title));
  if (!lead) return [];
  const from = mondayOf(lead.date.slice(0, 10));
  const to = shiftDays(from, 6);
  return idsOf([
    lead,
    ...feed.filter((item) => {
      const day = item.date.slice(0, 10);
      // The daily reports of that week are the daily tab's business, and five
      // of them would crowd out everything else the week held.
      return item !== lead && day >= from && day <= to && !PATTERNS.daily.test(item.title);
    }),
  ]);
}

async function readArticle(id: number): Promise<TradeReport | null> {
  const failed = failedAt.get(id);
  if (failed !== undefined && Date.now() - failed < FAILURE_BACKOFF_MS) return null;

  const article = await Promise.race([
    fetchExchangeArticle(id).catch((err) => {
      console.error("trade report fetch failed", id, err);
      return null;
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FETCH_BUDGET_MS)),
  ]);

  // An article with no body is a headline we already had.
  if (!article || article.body.length === 0) {
    failedAt.set(id, Date.now());
    return null;
  }
  failedAt.delete(id);
  return article;
}

/**
 * The reports behind the headlines already in `items`.
 *
 * Costs nothing in the steady state: the ids in the feed are the ids that
 * were stored, so no call is made. When the exchange publishes something new
 * — once a trading day — its body is read and kept.
 */
export async function getTradeReports(
  db: Db,
  items: MarketNewsItem[],
): Promise<TradeReports> {
  const snapshots = db.collection<ReportSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  const stored: TradeReports =
    cached?.schemaVersion === SCHEMA_VERSION
      ? cached.reports
      : { daily: [], weekly: [] };

  const held = new Map(
    [...stored.daily, ...stored.weekly].map((report) => [report.id, report]),
  );
  let fetched = false;

  const resolve = async (ids: number[], previous: TradeReport[]) => {
    if (ids.length === 0) return previous;
    const reports = await Promise.all(
      ids.map(async (id) => {
        const have = held.get(id);
        if (have) return have;
        const fresh = await readArticle(id);
        if (fresh) fetched = true;
        return fresh;
      }),
    );
    const kept = reports.filter((report): report is TradeReport => report !== null);
    // Falling back to what we had: a card states its own date, so an older
    // report on the page is honest in a way an empty one is not.
    return kept.length > 0 ? kept : previous;
  };

  const [daily, weekly] = await Promise.all([
    resolve(selectDaily(items), stored.daily),
    resolve(selectWeekly(items), stored.weekly),
  ]);
  const reports: TradeReports = { daily, weekly };

  if (fetched) {
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          reports,
          computedAt: new Date(),
          schemaVersion: SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
  }

  return reports;
}
