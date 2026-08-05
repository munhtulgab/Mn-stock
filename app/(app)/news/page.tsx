import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getMarketNews, type MarketNewsItem } from "@/lib/marketNews";

export const dynamic = "force-dynamic";

/** Weekday-and-date heading, e.g. "Лхагва, 8 сарын 5". */
const MONTHS = [
  "1 сарын",
  "2 сарын",
  "3 сарын",
  "4 сарын",
  "5 сарын",
  "6 сарын",
  "7 сарын",
  "8 сарын",
  "9 сарын",
  "10 сарын",
  "11 сарын",
  "12 сарын",
];
const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

/**
 * Formatted from the digits rather than through the reader's locale: the
 * sources state Ulaanbaatar time, and letting a device in another zone
 * re-interpret it would shift a closing report onto the previous day.
 */
function dayHeading(date: string, today: string, yesterday: string): string {
  const day = date.slice(0, 10);
  if (day === today) return "Өнөөдөр";
  if (day === yesterday) return "Өчигдөр";
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}`;
}

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
  const { items, today, yesterday } = await getMarketNews(db);
  const days = groupByDay(items);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Зах зээлийн мэдээ</h1>
        <p className="text-xs text-app-muted mt-0.5">
          Сүүлийн 30 хоног
          {items.length > 0 && ` · ${items.length} мэдээ`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted space-y-2">
          <p>Сүүлийн 30 хоногт мэдээ олдсонгүй.</p>
          <Link href="/settings" className="text-brand font-semibold">
            Мэдээллийн сайт нэмэх
          </Link>
        </div>
      ) : (
        days.map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="text-xs font-semibold text-app-muted mb-2">
              {dayHeading(day, today, yesterday)}
            </h2>
            <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
              {dayItems.map((item) => (
                <a
                  key={`${item.url}|${item.title}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 active:bg-app-elevated"
                >
                  <div className="text-sm text-app-text leading-snug">{item.title}</div>
                  <div className="text-[11px] text-app-muted mt-1 flex items-center gap-1.5">
                    <span className="text-brand">{item.source}</span>
                    {item.date.length > 10 && <span>· {item.date.slice(11, 16)}</span>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
