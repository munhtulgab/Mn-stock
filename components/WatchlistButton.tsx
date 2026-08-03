"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WatchlistButton({
  symbol,
  initialActive,
}: {
  symbol: string;
  initialActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/watchlist/${active ? "remove" : "add"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok) {
        setActive(!active);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label="Хяналтын жагсаалт"
      className={`flex items-center justify-center w-10 h-10 rounded-full border shrink-0 text-lg disabled:opacity-60 ${
        active
          ? "border-brand bg-brand-light text-brand"
          : "border-app-border bg-app-card text-app-muted"
      }`}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
