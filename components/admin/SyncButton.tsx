"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { RefreshIcon } from "@/components/icons";

/**
 * Runs the exchange sync by hand.
 *
 * The job is on a schedule and this is the button for when the schedule is not
 * soon enough — after a settings change, or when a source has been down. It
 * takes a while, so the button says so rather than looking dead.
 */
export default function SyncButton() {
  const [running, setRunning] = useState(false);
  const toast = useToast();

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Синк амжилтгүй боллоо");
      toast({
        title: "Синк дууслаа",
        body: `${data.securitiesRefreshed ?? 0} компани, ${data.pricesProcessed ?? 0} ханшийн багц`,
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Синк амжилтгүй",
        body: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={running}
      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm font-semibold text-app-text disabled:opacity-60"
    >
      <RefreshIcon size={15} />
      {running ? "Ажиллаж байна…" : "Одоо синк хийх"}
    </button>
  );
}
