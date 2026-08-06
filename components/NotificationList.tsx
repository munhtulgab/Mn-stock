import Link from "next/link";
import StockAvatar from "./StockAvatar";
import SignalBadge from "./SignalBadge";
import { BellIcon, ChevronRightIcon, NewsIcon } from "./icons";
import type { FeedNotification } from "@/lib/notifications";

/**
 * One day's alerts, in the same card the news feed uses.
 *
 * A signal change wears the company's own avatar and the badge it moved to,
 * so the feed reads like the market list rather than like a log — and unread
 * rows are tinted, with a dot on the avatar, so a glance finds what arrived
 * since the last visit. Tapping a row opens the company it is about.
 */
export default function NotificationList({ items }: { items: FeedNotification[] }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
      {items.map((n, i) =>
        n.url ? (
          <Link key={i} href={n.url} className="block active:bg-app-elevated">
            <Row n={n} />
          </Link>
        ) : (
          <Row key={i} n={n} />
        ),
      )}
    </div>
  );
}

function Row({ n }: { n: FeedNotification }) {
  return (
    <div className={`flex gap-3 px-4 py-3 ${n.isNew ? "bg-app-elevated" : ""}`}>
      <div className="relative shrink-0">
        {n.symbol ? (
          <StockAvatar symbol={n.symbol} size={38} />
        ) : (
          <div className="w-[38px] h-[38px] rounded-full bg-brand-light text-brand flex items-center justify-center">
            {n.kind === "news" ? <NewsIcon /> : <BellIcon />}
          </div>
        )}
        {n.isNew && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-app-elevated" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 text-sm font-semibold text-app-text leading-snug">
            {n.title}
          </div>
          {n.signal && <SignalBadge signal={n.signal} size="sm" />}
        </div>
        <div className="text-xs text-app-muted mt-0.5 break-words">{n.body}</div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px]">
          <span className="text-app-muted">{n.time}</span>
          {n.url && (
            <span className="text-brand font-medium inline-flex items-center gap-0.5 shrink-0">
              Дэлгэрэнгүй
              <ChevronRightIcon size={12} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
