"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "./icons";

/**
 * Fills the feed in behind the page.
 *
 * Building it means fetching every configured site, which takes long enough
 * that doing it during the render left the tab bar looking frozen. The page
 * now paints whatever was stored and this asks for a rebuild afterwards,
 * refreshing the route when one lands.
 */
export default function NewsRefresher({
  stale,
  empty,
}: {
  stale: boolean;
  empty: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!stale || started.current) return;
    started.current = true;
    setBusy(true);

    let cancelled = false;
    fetch("/api/news/refresh", { method: "POST" })
      .then((res) => res.json())
      .then((data: { count?: number }) => {
        if (!cancelled && data.count) router.refresh();
      })
      .catch(() => {
        // The stored feed stays on screen; the next visit tries again.
      })
      .finally(() => !cancelled && setBusy(false));

    return () => {
      cancelled = true;
    };
  }, [stale, router]);

  if (!busy) return null;

  return (
    <p className="flex items-center gap-1.5 text-xs text-app-muted">
      <span className="animate-spin">
        <RefreshIcon size={13} />
      </span>
      {empty ? "Мэдээ татаж байна…" : "Шинэчилж байна…"}
    </p>
  );
}
