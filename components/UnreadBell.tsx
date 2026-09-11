"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  readUnread,
  setUnread,
  subscribeUnread,
  unreadOnServer,
} from "@/lib/unreadCount";

/**
 * The bell, with the number of alerts waiting on it.
 *
 * The four pages carrying this header are dynamic, so the server always
 * counts correctly — but a reader arriving by tapping a tab is shown the
 * payload the router already holds for that route, rendered before they
 * cleared anything. Swiping four alerts away and tapping Нүүр left the bell
 * on the figure it had beforehand.
 *
 * So it prefers what this browser already knows, which the feed writes down
 * as the reader clears and opens things, and falls back to the page's own
 * figure on a fresh load where there is nothing written down yet. Asking the
 * server was the first fix for this and it is still here, but only behind
 * those two: on its own it left the old number on screen for the length of a
 * round trip, which is the delay this is no longer waiting out.
 *
 * Checked again whenever the tab is looked at, so a bell left open in a
 * background tab is not a stale one either.
 */
export default function UnreadBell({ initial }: { initial: number }) {
  // Null until this browser has been told a number, which is what makes the
  // server's figure the answer on a fresh load and never on a stale one.
  const known = useSyncExternalStore(subscribeUnread, readUnread, unreadOnServer);
  const unread = known ?? initial;

  useEffect(() => {
    let live = true;

    const check = async () => {
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (!res.ok) return;
        const data: { unread?: number } = await res.json();
        if (live && typeof data.unread === "number") setUnread(data.unread);
      } catch {
        // The number on screen is the last one known to be true, which is a
        // better thing to show than nothing.
      }
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={`Мэдэгдэл${unread > 0 ? ` (${unread} шинэ)` : ""}`}
      className="relative w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center text-app-muted active:scale-95 transition-transform"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M13.7 19a2 2 0 0 1-3.4 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand text-black text-[10px] font-bold flex items-center justify-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
