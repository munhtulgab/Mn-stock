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
import { getMarketReviews } from "@/lib/marketReview";
import { getTradeReports, type TradeReport } from "@/lib/tradeReports";
import type { MarketReview } from "@/lib/marketReview";
import { dayHeading, dayPossessive } from "@/lib/day";

export const dynamic = "force-dynamic";

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
): ReviewTab | null {
  if (!review && reports.length === 0) return null;
  return {
    label,
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
  // The reports come out of the feed — they are headlines already in it —
  // and the weekly one then says which week the weekly review is about, so
  // the card and the article beside it cover the same five days.
  const reports = await getTradeReports(db, items);
  const reviews = await getMarketReviews(db, reports.weekly[0]?.date);
  const days = groupByDay(items);
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
    reviewTab("7 хоног", "7 хоногийн зах зээлийн тойм", reviews.week, reports.weekly),
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
