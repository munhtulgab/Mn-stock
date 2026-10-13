"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { readUnread, setUnread, settled, subscribeUnread } from "@/lib/unreadCount";

/**
 * Keeps the unread alert count current wherever the reader is in the app,
 * and puts it on the app's icon.
 *
 * On the icon because that is where an app's count goes. iOS gives a web app
 * none of its own accord — the red number on a native app's icon is one the
 * app sets too — so with alerts waiting, the home screen showed a bare icon.
 * The service worker sets it as a push lands (see `public/sw.js`); this sets
 * it whenever the app learns the count has moved, which is how it comes down
 * again as alerts are read and cleared.
 *
 * And from the layout because the bell is only on four pages. The count used
 * to be refreshed by the bell itself, so an app opened from a push straight
 * onto a company page never asked, and the icon would have kept the number
 * the push left on it. This sits beside the tab bar on every page, and the
 * bell reads what it writes down.
 */
export default function UnreadSync() {
  const pathname = usePathname();

  // Asked again on every page, as the bell asked whenever a page carrying it
  // opened: an alert that arrived without a push — the feed gets every one,
  // a phone only some — should be counted by the next tap, not the next
  // time the app is closed and opened.
  useEffect(() => {
    let live = true;
    void fetchUnread().then((unread) => {
      if (live && unread !== null) setUnread(unread);
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    let live = true;

    const show = () => {
      const unread = readUnread();
      if (unread !== null) showOnIcon(unread);
    };

    // Checked again whenever the app is looked at, which on a phone is every
    // time it comes back from the background.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchUnread().then((unread) => {
        if (live && unread !== null) setUnread(unread);
      });
    };

    // The worker says when a push has changed the count, so an open app's
    // bell moves with the icon rather than waiting to be looked at again.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; unread?: unknown } | null;
      if (data?.type === "unread" && typeof data.unread === "number") setUnread(data.unread);
    };

    const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const unsubscribe = subscribeUnread(show);
    show();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    worker?.addEventListener("message", onMessage);
    return () => {
      live = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      worker?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}

/**
 * The server's count, or nothing if it could not be had.
 *
 * Asked only once the reader's own changes have reached the server, or it
 * is the count from before them — see `track`.
 */
async function fetchUnread(): Promise<number | null> {
  try {
    await settled();
    const res = await fetch("/api/notifications/count", { cache: "no-store" });
    if (!res.ok) return null;
    const data: { unread?: unknown } = await res.json();
    return typeof data.unread === "number" ? data.unread : null;
  } catch {
    // The number on screen is the last one known to be true, which is a
    // better thing to show than nothing.
    return null;
  }
}

/** The count on the app's icon, where the platform has an icon to put it on. */
function showOnIcon(unread: number): void {
  if (!("setAppBadge" in navigator)) return;
  // Refused without notification permission, and not supported everywhere
  // that has the method: the platform's call, and nothing to tell anybody.
  (unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
}
