"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { RefreshIcon } from "./icons";

/**
 * Rebuilds the feed from the page it is on.
 *
 * Building it means fetching every configured site, which takes long enough
 * that doing it during the render left the tab bar looking frozen. The page
 * paints whatever was stored; this asks for a rebuild — by itself when what
 * is stored has gone stale, or when the reader taps it — and refreshes the
 * route when one lands.
 *
 * Facebook is not re-scraped either way: those posts are bought once a
 * weekday by the scheduled run, and this reuses them.
 */
export default function NewsRefresher({
  stale,
  empty,
}: {
  stale: boolean;
  empty: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

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
          return;
        }

        router.refresh();
        if (!manual) return;
        // What arrived, not what is held: the feed keeps the same eighty
        // stories either way, and a reader who pressed refresh is asking
        // whether anything happened since they last looked.
        const added = data.added ?? 0;
        toast({
          variant: "success",
          title: added > 0 ? `${added} шинэ мэдээ` : "Шинэ мэдээ алга",
          body: added > 0 ? undefined : "Мэдээний урсгал хамгийн сүүлийн байдлаар.",
        });
      } catch {
        if (manual) toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );

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
