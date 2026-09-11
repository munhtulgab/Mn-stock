"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The bell, with the number of alerts waiting on it.
 *
 * The count starts as whatever the page was rendered with and then checks
 * itself. It has to: the four pages carrying this header are dynamic, so the
 * server always counts correctly, but a reader arriving by tapping a tab is
 * shown the payload the router already holds for that route — rendered
 * before they cleared anything. Swiping four alerts away and tapping Нүүр
 * left the bell on the figure it had beforehand.
 *
 * Checked again whenever the tab is looked at, so a bell left open in a
 * background tab is not a stale one either.
 */
export default function UnreadBell({ initial }: { initial: number }) {
  /**
   * What the bell has been told since the page was drawn, if anything.
   *
   * Kept apart from the rendered number rather than seeded with it: the
   * server's figure is right for the render it came from, and mirroring it
   * into state would have a later render of a stale route overwrite an
   * answer that is newer than it is.
   */
  const [checked, setChecked] = useState<number | null>(null);
  const unread = checked ?? initial;

  useEffect(() => {
    let live = true;

    const check = async () => {
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (!res.ok) return;
        const data: { unread?: number } = await res.json();
        if (live && typeof data.unread === "number") setChecked(data.unread);
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
