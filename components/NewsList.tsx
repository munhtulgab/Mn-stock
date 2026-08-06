import { ulaanbaatarDay, ulaanbaatarTime } from "@/lib/day";

export interface NewsListItem {
  title: string;
  url: string;
  /** Publisher, shown in the corner. */
  source: string;
  /** Local `YYYY-MM-DD[THH:MM:SS]`; the time is shown when stated. */
  date: string;
  /**
   * When the feed first carried this story, as an ISO instant. Stands in for
   * the time when the publisher gave only a day — see {@link formatWhen}.
   */
  addedAt?: string;
}

/**
 * One shape for every news list in the app, so a company's coverage and the
 * market feed read the same way: headline, then when it ran, then who ran it.
 *
 * Titles are upper-cased on display. The exchange writes its notices that way
 * already and the other publishers do not, which made a merged list look like
 * two lists — and the sources disagree among themselves too, so normalising
 * beats trusting whatever each one happened to send.
 */
export default function NewsList({ items }: { items: NewsListItem[] }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
      {items.map((item, i) => (
        <a
          key={`${item.url}|${i}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 py-3 active:bg-app-elevated"
        >
          <div className="text-sm font-semibold uppercase text-app-text leading-snug">
            {item.title}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px]">
            <span className="text-app-muted">
              {formatWhen(item.date, item.addedAt)}
            </span>
            <span className="text-brand truncate">{item.source}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Rendered from the digits rather than through Date: the sources state
 * Ulaanbaatar time, and a device in another zone would shift a closing
 * report onto the previous day.
 *
 * The exchange's own listing states a day and no time — the hour is only in
 * the article itself, which is a call per headline — so where a publisher
 * gives none, the moment the feed first carried the story stands in. That is
 * a fair reading of when it appeared, but only while the two fall on the
 * same day: a story we first saw a week after it ran gets no time rather
 * than one that would be wrong by a week.
 */
function formatWhen(date: string, addedAt?: string): string {
  if (!date) return "";
  const day = date.slice(0, 10);
  const stated = date.slice(11, 16);
  if (stated) return `${day} ${stated}`;

  if (addedAt) {
    const seen = new Date(addedAt);
    if (!Number.isNaN(seen.getTime()) && ulaanbaatarDay(seen) === day) {
      return `${day} ${ulaanbaatarTime(seen)}`;
    }
  }
  return day;
}
