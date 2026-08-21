"use client";

import { useState } from "react";
import Link from "next/link";
import StockAvatar from "./StockAvatar";
import SignalBadge from "./SignalBadge";
import { BellIcon, ChevronRightIcon, NewsIcon, TrashIcon } from "./icons";
import type { FeedNotification } from "@/lib/notifications";

/**
 * One day's alerts, in the same card the news feed uses.
 *
 * A signal change wears the company's own avatar and the badge it moved to,
 * so the feed reads like the market list rather than like a log. An alert
 * counts as read when the reader opens what it is about — not when the page
 * is opened — so a row stays tinted, with a dot on the avatar, until it has
 * actually been followed. Swiping a row to the left throws it away.
 */
export default function NotificationList({ items }: { items: FeedNotification[] }) {
  // Rows leave the list the moment they are swiped away rather than on the
  // server's reply: the reader has already watched it go.
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const visible = items.filter((n) => !dismissed.includes(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
      {visible.map((n) => (
        <SwipeRow
          key={n.id}
          n={{ ...n, isNew: n.isNew && !read.includes(n.id) }}
          onOpen={() => {
            setRead((ids) => [...ids, n.id]);
            send(n.id, "POST");
          }}
          onDismiss={() => {
            setDismissed((ids) => [...ids, n.id]);
            send(n.id, "DELETE");
          }}
        />
      ))}
    </div>
  );
}

function send(id: string, method: "POST" | "DELETE") {
  fetch(`/api/notifications/${id}`, { method, keepalive: true }).catch(() => {
    // Nothing to say to the reader: the row has already moved, and the next
    // page load reads the server's answer either way.
  });
}

/** Past this much of a drag, letting go throws the row away. */
const COMMIT_PX = 96;
/** How far the row can be dragged; the bin sits under the last of it. */
const MAX_PX = 132;
/** Below this a movement is a tap or the start of a scroll, not a swipe. */
const SLOP_PX = 8;

function SwipeRow({
  n,
  onOpen,
  onDismiss,
}: {
  n: FeedNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [swiping, setSwiping] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function down(event: React.PointerEvent) {
    // A pen or a mouse drags too; only the primary button starts one.
    if (event.button !== 0) return;
    setStart({ x: event.clientX, y: event.clientY });
    setSwiping(false);
  }

  function move(event: React.PointerEvent) {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (!swiping) {
      // Vertical first: the page scrolls under the finger, and a row that
      // grabbed every touch would make the list impossible to scroll past.
      if (Math.abs(dy) > Math.abs(dx)) {
        setStart(null);
        return;
      }
      if (dx > -SLOP_PX) return;
      setSwiping(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    // Leftwards only: there is nothing revealed on the other side.
    setOffset(Math.max(-MAX_PX, Math.min(0, dx)));
  }

  function up() {
    if (offset <= -COMMIT_PX) {
      setLeaving(true);
      setOffset(-MAX_PX);
      // Let the row finish sliding out before the list drops it.
      setTimeout(onDismiss, 160);
      return;
    }
    setOffset(0);
    setStart(null);
    setSwiping(false);
  }

  const row = <Row n={n} />;

  return (
    <div className="relative overflow-hidden">
      {/* Underneath, so the row slides off it rather than over a blank gap. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 flex w-[132px] items-center justify-center bg-app-negative-bg text-app-negative"
      >
        <TrashIcon size={18} />
      </div>

      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // A row is a link, and dragging a link is how a browser starts a
        // native drag-and-drop — which cancels the pointer and leaves the
        // swipe half-finished. There is nothing here worth dragging out.
        onDragStart={(event) => event.preventDefault()}
        // Vertical panning stays with the browser; horizontal comes here.
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping && !leaving ? undefined : "transform 160ms ease-out",
          touchAction: "pan-y",
          opacity: leaving ? 0.4 : 1,
        }}
        className="relative select-none bg-app-card"
      >
        {n.url ? (
          <Link
            href={n.url}
            draggable={false}
            onClick={(event) => {
              // A drag that ended on the row is not a tap on it.
              if (offset !== 0 || swiping) {
                event.preventDefault();
                return;
              }
              onOpen();
            }}
            className="block active:bg-app-elevated"
          >
            {row}
          </Link>
        ) : (
          row
        )}
      </div>

      {/* No swipe with a keyboard, so the same action has a button of its own
          for anyone who is not holding the screen. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`"${n.title}" мэдэгдлийг устгах`}
        className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-10 focus:rounded-full focus:bg-app-negative-bg focus:px-3 focus:py-1 focus:text-xs focus:text-app-negative"
      >
        Устгах
      </button>
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
