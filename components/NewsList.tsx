import { ulaanbaatarTime } from "@/lib/day";

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
          // Only a foreign story opens elsewhere. The app's own summaries sit
          // in this same list and are already on this page; sending one to a
          // new tab would leave the reader looking at a second copy of where
          // they started.
          {...(isInternal(item.url)
            ? {}
            : { target: "_blank", rel: "noopener noreferrer" })}
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

/** A link into this app rather than out of it. */
function isInternal(url: string): boolean {
  return url.startsWith("#") || url.startsWith("/");
}

/**
 * Rendered from the digits rather than through Date: the sources state
 * Ulaanbaatar time, and a device in another zone would shift a closing
 * report onto the previous day.
 *
 * Every row carries a time. Where the publisher stated one it is theirs; the
 * exchange's listing does not, so the feed fills those in from the article
 * itself as they arrive, and anything still without one falls back to the
 * moment the feed first carried it. Which of the three a row is showing is
 * not marked: all three answer the same question a reader is asking, which
 * is how long ago this was.
 */
function formatWhen(date: string, addedAt?: string): string {
  if (!date) return "";
  const day = date.slice(0, 10);
  const stated = date.slice(11, 16);
  if (stated) return `${day} ${stated}`;

  if (addedAt) {
    const seen = new Date(addedAt);
    if (!Number.isNaN(seen.getTime())) return `${day} ${ulaanbaatarTime(seen)}`;
  }
  return day;
}
