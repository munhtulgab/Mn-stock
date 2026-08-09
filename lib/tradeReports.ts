import type { Db } from "mongodb";
import {
  fetchExchangeArticle,
  fetchExchangeNews,
  type ArticleBlock,
} from "@/lib/mse/exchangeNews";
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
  /** The exchange's article number, absent on a slide from anywhere else. */
  id?: number;
  title: string;
  /** YYYY-MM-DD as the exchange stated it. */
  date: string;
  url: string;
  body: ArticleBlock[];
  /**
   * Who published it, for the footer. Absent means the exchange, which is
   * where every slide came from until the index summaries joined them.
   */
  source?: string;
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
  // Both wordings the exchange uses for a session: the dated report and the
  // review of the same day.
  daily: /ӨДРИЙН\s+АРИЛЖААНЫ\s+(?:ТОЙМ\s+)?МЭДЭЭ/i,
  weekly: /ДОЛОО\s+ХОНОГИЙН\s+АРИЛЖААНЫ\s+ТОЙМ/i,
  /**
   * The index summaries, which are about the session but are not the
   * exchange's own writing — they come from the news sites configured in
   * settings, so they are found in the app's feed rather than in mse.mn's
   * listing.
   *
   * Anchored at the start, because that is what makes it this kind of story
   * rather than any article that mentions the index in passing. Both scripts
   * are matched: "ТОП" in Cyrillic and "TOP" in Latin look identical on a
   * screen and sources use each.
   */
  top20: /^\s*(?:ТОП|TOP)\s*[-–—‑]?\s*20\s+индекс/i,
} as const;

/** Enough for a period to have more than one side; past it, it is a feed. */
const PER_PERIOD = 3;

const SNAPSHOT_KEY = "tradeReports";
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 4;

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
function exchangeItems(items: Headline[]): Headline[] {
  return items.filter((item) => item.url.includes("mse.mn/news/"));
}

/** The little a headline has to carry for a report to be found by it. */
type Headline = { title: string; date: string; url: string };

function idsOf(items: Headline[]): number[] {
  return items
    .map((item) => articleId(item.url))
    .filter((id): id is number => id !== null)
    .slice(0, PER_PERIOD);
}

/**
 * The latest session's trading reports, and only those.
 *
 * Every slide in this period is a report of the same day: the dated one and
 * the review of it, where the exchange published both. It used to carry
 * whatever else went out that day too — a bond auction, a membership notice,
 * a training course — which made a slider labelled "the day's trading" mostly
 * about other things.
 */
function selectDaily(items: Headline[]): number[] {
  const feed = exchangeItems(items).filter((item) => PATTERNS.daily.test(item.title));
  const lead = feed[0];
  if (!lead) return [];
  // The newest day that has one, so a session with two reports shows both and
  // yesterday's does not follow them.
  const day = lead.date.slice(0, 10);
  return idsOf(feed.filter((item) => item.date.slice(0, 10) === day));
}

/** The day the daily slider is showing, so nothing older is added to it. */
function dailyDay(items: Headline[]): string | null {
  const lead = exchangeItems(items).find((item) => PATTERNS.daily.test(item.title));
  return lead ? lead.date.slice(0, 10) : null;
}

/**
 * The newest index summary, as a slide.
 *
 * It carries no body: these live on other people's sites, and the exchange's
 * article API — the only one this app can read a body from — knows nothing
 * about them. The card handles that, showing the headline, the date and a
 * link out, which is all there is to show.
 *
 * Never older than the session the tab is headed by. A tab labelled "the
 * last day" that carries last Tuesday's index is worse than one that carries
 * nothing, and the day is the one thing a reader cannot check at a glance
 * when the title does not state it.
 */
function selectTop20(items: Headline[], notBefore: string | null): TradeReport | null {
  const story = items.find((item) => PATTERNS.top20.test(item.title));
  if (!story) return null;
  const day = story.date.slice(0, 10);
  if (notBefore && day < notBefore) return null;

  let source: string;
  try {
    source = new URL(story.url).hostname.replace(/^www\./, "");
  } catch {
    source = story.url;
  }
  return { title: story.title, date: day, url: story.url, body: [], source };
}

/**
 * The exchange's weekly review, and only that.
 *
 * The app's own summary of the same week is put beside it by the page, so
 * between them the week's slider is two accounts of the week and nothing
 * else. It used to carry the rest of the week's announcements as well, which
 * buried the review it is named after.
 */
function selectWeekly(items: Headline[]): number[] {
  // The newest one only. The exchange publishes one of these a week and the
  // feed holds a month of them; the week's tab is about this week.
  return idsOf(
    exchangeItems(items)
      .filter((item) => PATTERNS.weekly.test(item.title))
      .slice(0, 1),
  );
}

/** Exposed for the tests, which cover the selection rules rather than the fetch. */
export const __testing = { selectTop20, dailyDay, PATTERNS };

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
  // Which headlines to look through.
  //
  // Not the app's own feed: that holds 80 stories across every source, which
  // at the rate they publish is a few days, so the exchange's weekly review
  // had dropped out of it within a week of going up and the week's tab was
  // left with a summary and no report beside it. The exchange's own listing
  // reaches back a month or more and is one call. The feed stands in if that
  // call fails, which is what it was doing all along.
  const headlines: Headline[] = await fetchExchangeNews(60)
    .then((news) => news.map((n) => ({ title: n.title, date: n.date, url: n.url })))
    .catch((err) => {
      console.error("exchange listing unavailable for reports", err);
      return items.map((i) => ({ title: i.title, date: i.date, url: i.url }));
    });

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
    resolve(selectDaily(headlines), stored.daily),
    resolve(selectWeekly(headlines), stored.weekly),
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

  // Appended after the snapshot is written, deliberately: what is stored is
  // the set of exchange articles whose bodies were expensive to read, and
  // this one has no body to keep. Storing it would put a headline into the
  // cache that the fallback path could serve back weeks later, long after it
  // stopped being the last session's.
  //
  // Read from the app's own feed rather than the exchange listing above —
  // these summaries are published by the news sites in settings, and mse.mn
  // has never carried one.
  //
  // After the exchange's own report rather than before it: the session report
  // is what the tab is for and what a reader arrives expecting, and this is a
  // second account of the same day.
  const top20 = selectTop20(
    items.map((i) => ({ title: i.title, date: i.date, url: i.url })),
    dailyDay(headlines),
  );
  return top20 ? { daily: [...daily, top20], weekly } : reports;
}
