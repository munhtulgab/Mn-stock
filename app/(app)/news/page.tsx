import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getMarketNews, type MarketNewsItem } from "@/lib/marketNews";
import NewsRefresher from "@/components/NewsRefresher";
import NewsList from "@/components/NewsList";
import MarketReviewCard from "@/components/MarketReviewCard";
import { getMarketReviews } from "@/lib/marketReview";
import { dayHeading } from "@/lib/day";

export const dynamic = "force-dynamic";

function groupByDay(items: MarketNewsItem[]): [string, MarketNewsItem[]][] {
  const groups = new Map<string, MarketNewsItem[]>();
  for (const item of items) {
    const day = item.date.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()];
}

export default async function NewsPage() {
  const db = await getDb();
  const [{ items, today, yesterday, stale }, reviews] = await Promise.all([
    getMarketNews(db),
    getMarketReviews(db),
  ]);
  const days = groupByDay(items);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-text">Зах зээлийн мэдээ</h1>
          <p className="text-xs text-app-muted mt-0.5">
            Сүүлийн 30 хоног
            {items.length > 0 && ` · ${items.length} мэдээ`}
          </p>
        </div>
        <NewsRefresher stale={stale} empty={items.length === 0} />
      </div>

      {/* The period reviews lead: what the week and the month did is the
          thing a reader wants before the day's headlines, and neither is
          published by the exchange in a form that could be linked to. */}
      {(reviews.week || reviews.month) && (
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
          {reviews.week && (
            <MarketReviewCard title="7 хоногийн зах зээлийн тойм" review={reviews.week} />
          )}
          {reviews.month && (
            <MarketReviewCard
              title="Өнгөрсөн сарын зах зээлийн тойм"
              review={reviews.month}
            />
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted space-y-2">
          <p>{stale ? "Мэдээ бэлдэж байна." : "Сүүлийн 30 хоногт мэдээ олдсонгүй."}</p>
          <Link href="/settings" className="text-brand font-semibold">
            Мэдээллийн сайт нэмэх
          </Link>
        </div>
      ) : (
        // Two columns of days on a wide screen; the days keep their order
        // down the left column and then the right.
        <div className="space-y-5 lg:space-y-0 lg:columns-2 lg:gap-5">
        {days.map(([day, dayItems]) => (
          <section key={day} className="lg:mb-5 lg:break-inside-avoid">
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
