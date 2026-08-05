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
   * The star fills on the tap, not on the answer.
   *
   * It used to wait for the round trip and then ask the router to re-render
   * the page it sits on — a company's page, which rebuilds indicators and
   * reaches for a live quote. The write itself takes a moment; the wait was
   * seconds of a button that looked broken. The state is the reader's now,
   * and it is put back if the server refuses.
   */
  async function toggle() {
    if (busy) return;
    const adding = !active;
    setActive(adding);
    setBusy(true);
    try {
      const res = await fetch(`/api/watchlist/${adding ? "add" : "remove"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        setActive(!adding);
        toast({ variant: "error", title: "Хадгалж чадсангүй", body: `${symbol}` });
        return;
      }
      toast({
        variant: "success",
        title: adding ? "Хяналтад нэмлээ" : "Хяналтаас хаслаа",
        body: symbol,
      });
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
      className={`flex items-center justify-center w-10 h-10 rounded-full border shrink-0 active:scale-95 transition-transform ${
        active
          ? "border-brand bg-brand-light text-brand"
          : "border-app-border bg-app-card text-app-muted"
      }`}
    >
      <BookmarkIcon size={18} filled={active} />
    </button>
  );
}
