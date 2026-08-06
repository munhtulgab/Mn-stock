import type { Db } from "mongodb";
import {
  fetchExchangeArticle,
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
 * The article's body is a second call, so it is fetched once when the report
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
  daily: TradeReport | null;
  weekly: TradeReport | null;
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

const SNAPSHOT_KEY = "tradeReports";
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 1;

/**
 * How long a page render will wait for a report it has not read before.
 * Past it the page shows the report it already had — a day-old report beats
 * a page that hangs on the exchange being slow.
 */
const FETCH_BUDGET_MS = 4_000;

/**
 * How long a report that could not be read is left alone.
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

function pick(items: MarketNewsItem[], pattern: RegExp): number | null {
  // Items arrive newest first. Only the exchange's own copy carries the
  // report body; a syndicated headline of the same name does not.
  const item = items.find(
    (candidate) => candidate.source === "mse.mn" && pattern.test(candidate.title),
  );
  return item ? articleId(item.url) : null;
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
  // A report with no body is a headline we already had.
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
 * were stored, so no call is made. When the exchange publishes a new report
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
      : { daily: null, weekly: null };

  const wanted = {
    daily: pick(items, PATTERNS.daily),
    weekly: pick(items, PATTERNS.weekly),
  };

  const resolve = async (
    kind: keyof TradeReports,
  ): Promise<{ report: TradeReport | null; fetched: boolean }> => {
    const id = wanted[kind];
    const held = stored[kind];
    if (id === null) return { report: held, fetched: false };
    if (held?.id === id) return { report: held, fetched: false };

    const fresh = await readArticle(id);
    // Falling back to what we had: the card states its own date, so an older
    // report on the page is honest in a way an empty one is not.
    return { report: fresh ?? held, fetched: fresh !== null };
  };

  const [daily, weekly] = await Promise.all([resolve("daily"), resolve("weekly")]);
  const reports: TradeReports = { daily: daily.report, weekly: weekly.report };

  if (daily.fetched || weekly.fetched) {
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
