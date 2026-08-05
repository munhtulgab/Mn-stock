export interface NewsListItem {
  title: string;
  url: string;
  /** Publisher, shown in the corner. */
  source: string;
  /** Local `YYYY-MM-DD[THH:MM:SS]`; the time is shown when stated. */
  date: string;
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
          <div className="text-[11px] text-app-muted mt-1">{formatWhen(item.date)}</div>
          <div className="text-[11px] text-brand mt-0.5">{item.source}</div>
        </a>
      ))}
    </div>
  );
}

/**
 * Rendered from the digits rather than through Date: the sources state
 * Ulaanbaatar time, and a device in another zone would shift a closing
 * report onto the previous day.
 */
function formatWhen(date: string): string {
  if (!date) return "";
  const day = date.slice(0, 10);
  const time = date.slice(11, 16);
  return time ? `${day} ${time}` : day;
}
