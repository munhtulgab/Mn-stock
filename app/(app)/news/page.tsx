import Link from "next/link";
import { after } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import {
  countNewSince,
  getMarketNews,
  markNewsSeen,
  type MarketNewsItem,
} from "@/lib/marketNews";
import NewsRefresher from "@/components/NewsRefresher";
import NewsList from "@/components/NewsList";
import MarketReviewCard from "@/components/MarketReviewCard";
import TradeReportCard from "@/components/TradeReportCard";
import ReviewTabs, { type ReviewTab } from "@/components/ReviewTabs";
import ReportSlider from "@/components/ReportSlider";
import { getMarketReviews, weeklyReviewTitle } from "@/lib/marketReview";
import { getTradeReports, type TradeReport } from "@/lib/tradeReports";
import type { MarketReview } from "@/lib/marketReview";
import { dayHeading, dayPossessive } from "@/lib/day";

export const dynamic = "force-dynamic";

/**
 * Fragment that opens the weekly tab, for the feed row below.
 *
 * ASCII, though everything around it is Cyrillic: a fragment goes into the
 * address bar percent-encoded, so `location.hash` reads back as
 * "%D0%B4%D0%BE..." and never matches the tab it was written from.
 */
const WEEKLY_HASH = "weekly-review";

/**
 * The app's weekly summary, as a story in the feed.
 *
 * It is a report of the same kind as the exchange's own — five named days,
 * the same turnover, the same movers — and a reader scanning the week's
 * headlines should find it among them rather than only as a panel above
 * them. It links into the page it is already on, which is why NewsList
 * leaves an internal row in the current tab.
 */
function weeklyReviewStory(review: MarketReview): MarketNewsItem {
  return {
    title: weeklyReviewTitle(review),
    url: `#${WEEKLY_HASH}`,
    source: "MSE Advisor",
    // Dated to the week's last session, so it files under that day with the
    // reports covering the same period.
    date: review.to,
  };
}

function groupByDay(items: MarketNewsItem[]): [string, MarketNewsItem[]][] {
  const groups = new Map<string, MarketNewsItem[]>();
  for (const item of items) {
    const day = item.date.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()];
}

/**
 * One period's tab: the figures worked out from stored closes, and beside
 * them what the exchange itself published about the same period — which is
 * often more than one article, so that side is a slider.
 */
function reviewTab(
  label: string,
  title: string,
  review: MarketReview | null,
  reports: TradeReport[],
  /**
   * Puts this period's own summary into the slider rather than beside it.
   *
   * The week wants it: its summary is a dated report like the exchange's
   * own, covering the same five days, so the two read as two accounts of
   * one week and belong in the same slot. The day does not — its summary is
   * the figures for a session that is still the newest thing on the page,
   * and burying it behind a swipe would hide the answer to "what happened
   * today" behind a gesture.
   */
  options: { asSlide?: boolean; hash?: string } = {},
): ReviewTab | null {
  if (!review && reports.length === 0) return null;

  if (options.asSlide) {
    const slides = [
      ...(review
        ? [<MarketReviewCard key="own" title={title} review={review} />]
        : []),
      ...reports.map((report) => (
        <TradeReportCard key={report.id} report={report} />
      )),
    ];
    return {
      label,
      hash: options.hash,
      content: (
        <ReportSlider
          labels={[
            ...(review ? [title] : []),
            ...reports.map((report) => report.title),
          ]}
          slides={slides}
        />
      ),
    };
  }

  return {
    label,
    hash: options.hash,
    content: (
      // Side by side only when there are two of them: the month has nothing
      // of the exchange's own, and one card in a two-column grid is a card
      // beside a hole. Stretched rather than top-aligned, so the two end
      // level instead of one trailing off below the other.
      <div
        className={`space-y-4 lg:space-y-0 lg:grid lg:gap-4 lg:items-stretch ${
          review && reports.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1"
        }`}
      >
        {review && <MarketReviewCard title={title} review={review} />}
        {reports.length > 0 && (
          <ReportSlider
            labels={reports.map((report) => report.title)}
            slides={reports.map((report) => (
              <TradeReportCard key={report.id} report={report} />
            ))}
          />
        )}
      </div>
    ),
  };
}

export default async function NewsPage() {
  const db = await getDb();
  const [user, { items, today, yesterday, stale }] = await Promise.all([
    getCurrentUser(db),
    getMarketNews(db),
  ]);
  // The reports come out of the feed — they are headlines already in it.
  //
  // The weekly review is no longer anchored to the exchange's article. It
  // used to be, so the two covered the same five days while they sat side by
  // side; but the exchange publishes its review of a week during the week
  // after, which left the card describing the previous week on the Friday of
  // a full one. They are slides in one slot now, each carrying its own dates,
  // and the app's summary describes the week it has the prices for.
  const reports = await getTradeReports(db, items);
  const reviews = await getMarketReviews(db);
  // Ahead of the exchange's own stories for the same day: it is the summary
  // of the whole week those stories are pieces of.
  const feed = reviews.week
    ? [weeklyReviewStory(reviews.week), ...items]
    : items;
  const days = groupByDay(feed);
  const fresh = countNewSince(items, user?.newsSeenAt);

  // Marked after the page has been sent, so what the reader is looking at is
  // still counted as new — the next visit is what resets it.
  if (user?._id) {
    const id = user._id;
    after(() =>
      markNewsSeen(db, id).catch((err) =>
        console.error("marking the news feed seen failed", err),
      ),
    );
  }

  // The last session leads, because it is the one that has just changed.
  const dayLabel = reviews.day
    ? dayHeading(reviews.day.to, today, yesterday)
    : "Өдрийн";
  const tabs = [
    reviewTab(
      dayLabel,
      `${
        reviews.day ? dayPossessive(reviews.day.to, today, yesterday) : "Өдрийн"
      } зах зээлийн тойм`,
      reviews.day,
      reports.daily,
    ),
    // Named for the five days it covers, and sliding: the app's summary and
    // the exchange's own review of the same week are two accounts of one
    // thing and share a slot.
    reviewTab(
      "7 хоног",
      reviews.week
        ? weeklyReviewTitle(reviews.week)
        : "Долоо хоногийн тойм",
      reviews.week,
      reports.weekly,
      { asSlide: true, hash: WEEKLY_HASH },
    ),
    reviewTab("Өнгөрсөн сар", "Өнгөрсөн сарын зах зээлийн тойм", reviews.month, []),
  ].filter((tab): tab is ReviewTab => tab !== null);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-text">Зах зээлийн мэдээ</h1>
          <p className="text-xs text-app-muted mt-0.5">
            Сүүлийн 30 хоног
            {fresh > 0 && ` · ${fresh} шинэ мэдээ`}
          </p>
        </div>
        <NewsRefresher stale={stale} empty={items.length === 0} />
      </div>

      {/* The reviews lead: what the session, the week and the month did is
          the thing a reader wants before the day's headlines. */}
      {tabs.length > 0 && <ReviewTabs tabs={tabs} />}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted space-y-2">
          <p>{stale ? "Мэдээ бэлдэж байна." : "Сүүлийн 30 хоногт мэдээ олдсонгүй."}</p>
          <Link href="/settings" className="text-brand font-semibold">
            Мэдээллийн сайт нэмэх
          </Link>
        </div>
      ) : (
        // One column at every width: two columns put a Monday beside a
        // Thursday, and a feed that is read newest-first should be read
        // straight down.
        <div className="space-y-5">
        {days.map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="text-xs font-semibold text-app-muted mb-2">
              {dayHeading(day, today, yesterday)}
            </h2>
            <NewsList items={dayItems} />
          </section>
        ))}
        </div>
      )}
    </div>
  );
}
