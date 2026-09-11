"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";
import { RefreshIcon } from "./icons";

/**
 * Rebuilds the feed from the page it is on.
 *
 * Building it means fetching every configured site, which takes long enough
 * that doing it during the render left the tab bar looking frozen. The page
 * paints whatever was stored; this asks for a rebuild — by itself when what
 * is stored has gone stale, or when the reader taps it — and puts the
 * rebuilt feed on screen when one lands.
 *
 * Facebook is not re-scraped either way: those posts are bought once a
 * weekday by the scheduled run, and this reuses them.
 */

/**
 * Where the count waits while the page reloads.
 *
 * The reader is told what arrived, and the reload that shows them throws
 * away the component that would have said it — so the number is handed over
 * to the page that comes back.
 */
const ARRIVED_KEY = "mse:news-arrived";

export default function NewsRefresher({
  stale,
  empty,
}: {
  stale: boolean;
  empty: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  /**
   * Reloads the page rather than refreshing the route.
   *
   * `router.refresh()` is the cheaper move and it does not arrive. Traced
   * against a production build: the rebuild replies, the router asks for the
   * page again, the server sends all hundred and fourteen kilobytes of it —
   * and the request ends `net::ERR_ABORTED` with the payload never applied,
   * so the reader is left looking at the list they started with. It landed
   * in two runs out of six, once after a minute and a half. What the button
   * promises has to happen every time, and a reload is the one way of
   * putting a rebuilt feed on screen that cannot be cancelled underneath it.
   *
   * The page costs well under a second to render, so this is not the
   * expensive option it would be on a heavier route.
   */
  const show = useCallback((added: number | null) => {
    if (added !== null) {
      try {
        sessionStorage.setItem(ARRIVED_KEY, String(added));
      } catch {
        // A browser that refuses storage still gets the new stories; it is
        // only the sentence about them that is lost.
      }
    }
    window.location.reload();
  }, []);

  const refresh = useCallback(
    async (manual: boolean) => {
      setBusy(true);
      try {
        const res = await fetch("/api/news/refresh", { method: "POST" });
        const data: { ok?: boolean; added?: number } = await res
          .json()
          .catch(() => ({}));
        if (!data.ok) {
          if (manual) toast({ variant: "error", title: "Шинэчилж чадсангүй" });
          setBusy(false);
          return;
        }

        // What arrived, not what is held: the feed keeps the same eighty
        // stories either way, and a reader who pressed refresh is asking
        // whether anything happened since they last looked.
        //
        // Busy is deliberately left on. The page is on its way out, and a
        // button that says it has finished while the old list is still up is
        // the thing this was reported for.
        show(manual ? (data.added ?? 0) : null);
      } catch {
        if (manual) toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
        setBusy(false);
      }
    },
    [show, toast],
  );

  // The sentence the reload was carrying, said over the list it describes.
  useEffect(() => {
    let arrived: string | null = null;
    try {
      arrived = sessionStorage.getItem(ARRIVED_KEY);
      if (arrived !== null) sessionStorage.removeItem(ARRIVED_KEY);
    } catch {
      return;
    }
    if (arrived === null) return;
    const added = Number(arrived);
    if (!Number.isFinite(added)) return;
    toast({
      variant: "success",
      title: added > 0 ? `${added} шинэ мэдээ` : "Шинэ мэдээ алга",
      body: added > 0 ? undefined : "Мэдээний урсгал хамгийн сүүлийн байдлаар.",
    });
  }, [toast]);

  useEffect(() => {
    if (!stale || auto.current) return;
    auto.current = true;
    refresh(false);
  }, [stale, refresh]);

  return (
    <button
      onClick={() => refresh(true)}
      disabled={busy}
      aria-label="Мэдээ шинэчлэх"
      className="flex items-center gap-1.5 rounded-full border border-app-border bg-app-card px-3 py-1.5 text-xs font-medium text-brand disabled:opacity-60 active:scale-95 transition-transform"
    >
      <span className={busy ? "animate-spin" : ""}>
        <RefreshIcon size={14} />
      </span>
      {busy ? (empty ? "Татаж байна…" : "Шинэчилж байна…") : "Шинэчлэх"}
    </button>
  );
}
