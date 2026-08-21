"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { BookmarkIcon } from "./icons";

export default function WatchlistButton({
  symbol,
  initialActive,
}: {
  symbol: string;
  initialActive: boolean;
}) {
  const toast = useToast();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);

  /**
   * The mark fills and the notice appears on the tap, not on the answer.
   *
   * It used to wait for the round trip and then ask the router to re-render
   * the page it sits on — a company's page, which rebuilds indicators and
   * reaches for a live quote. The fill was made optimistic then; the notice
   * was not, so a tap still sat silent for as long as the write took, and
   * the write was answering with the whole watchlist priced from the live
   * feed. That answer is gone from the routes and this no longer waits for
   * the rest of it.
   *
   * Both are put back if the server refuses, and the failure says so — an
   * optimistic write that fails quietly is worse than a slow one.
   */
  async function toggle() {
    if (busy) return;
    const adding = !active;
    setActive(adding);
    setBusy(true);
    toast({
      variant: "success",
      title: adding ? "Хяналтад нэмлээ" : "Хяналтаас хаслаа",
      body: symbol,
    });
    try {
      const res = await fetch(`/api/watchlist/${adding ? "add" : "remove"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        setActive(!adding);
        toast({ variant: "error", title: "Хадгалж чадсангүй", body: symbol });
      }
    } catch {
      setActive(!adding);
      toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      /* Not disabled while the write is in flight: the star already shows
         what the reader asked for, and a locked button reads as a hang. */
      aria-label={active ? "Хяналтаас хасах" : "Хяналтад нэмэх"}
      aria-pressed={active}
      /* 44px: the smallest target a thumb hits reliably, and the size the
         rest of this row is built around. */
      className={`flex items-center justify-center w-11 h-11 rounded-full border shrink-0 active:scale-95 transition-transform ${
        active
          ? "border-brand bg-brand-light text-brand"
          : "border-app-border bg-app-card text-app-muted"
      }`}
    >
      <BookmarkIcon size={20} filled={active} />
    </button>
  );
}
