"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { RefreshIcon } from "@/components/icons";

/**
 * Runs the exchange sync by hand.
 *
 * The job is on a schedule and this is the button for when the schedule is not
 * soon enough — after a settings change, or when a source has been down. It
 * takes a while, so the button says so rather than looking dead.
 *
 * And the page it sits on is redrawn when it finishes. Системийн байдал two
 * panels away states the last sync time, and the whole point of pressing this
 * is to change that: a toast saying it worked over a panel still showing
 * yesterday's timestamp is the button reporting one thing and the page
 * another. The refresh runs on failure too — a sync that gave up partway
 * still moved what it managed before it stopped.
 */
export default function SyncButton() {
  const [running, setRunning] = useState(false);
  const router = useRouter();
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
      router.refresh();
    }
  }

  return (
    <button
      onClick={run}
      disabled={running}
      style={{ background: "linear-gradient(142deg, var(--admin-fill-from), var(--admin-fill-to))" }}
      className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      <RefreshIcon size={15} />
      {running ? "Ажиллаж байна…" : "Одоо синк хийх"}
    </button>
  );
}
