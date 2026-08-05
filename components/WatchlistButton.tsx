"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const adding = !active;
    try {
      const res = await fetch(`/api/watchlist/${active ? "remove" : "add"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        toast({ variant: "error", title: "Хадгалж чадсангүй", body: `${symbol}` });
        return;
      }
      setActive(adding);
      toast({
        variant: "success",
        title: adding ? "Хяналтад нэмлээ" : "Хяналтаас хаслаа",
        body: symbol,
      });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={active ? "Хяналтаас хасах" : "Хяналтад нэмэх"}
      aria-pressed={active}
      className={`flex items-center justify-center w-10 h-10 rounded-full border shrink-0 disabled:opacity-60 active:scale-95 transition-transform ${
        active
          ? "border-brand bg-brand-light text-brand"
          : "border-app-border bg-app-card text-app-muted"
      }`}
    >
      <BookmarkIcon size={18} filled={active} />
    </button>
  );
}
