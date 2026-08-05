"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardRow } from "@/lib/data";
import SignalBadge from "./SignalBadge";
import Sparkline from "./Sparkline";
import StockAvatar from "./StockAvatar";
import Num, { Pct } from "./Num";

type SortKey = "symbol" | "lastPrice" | "changePct" | "score";

export default function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const [query, setQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<"ALL" | DashboardRow["signal"]>(
    "ALL",
  );
  const [sortKey] = useState<SortKey>("score");
  const [sortDir] = useState<1 | -1>(-1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows.filter(
      (r) =>
        !q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
    if (signalFilter !== "ALL") {
      result = result.filter((r) => r.signal === signalFilter);
    }
    result = [...result].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return sortDir * String(av).localeCompare(String(bv));
      }
      return sortDir * ((av as number) - (bv as number));
    });
    return result;
  }, [rows, query, signalFilter, sortKey, sortDir]);

  // Computed here rather than imported from lib/data: that module reaches
  // into MongoDB, and this component ships to the browser.
  const session = useMemo(
    () =>
      rows.reduce<string | null>(
        (latest, r) => (r.lastDate && (!latest || r.lastDate > latest) ? r.lastDate : latest),
        null,
      ),
    [rows],
  );

  const counts = useMemo(
    () => ({
      BUY: rows.filter((r) => r.signal === "BUY").length,
      SELL: rows.filter((r) => r.signal === "SELL").length,
      HOLD: rows.filter((r) => r.signal === "HOLD").length,
    }),
    [rows],
  );

  return (
    <div>
      <div className="flex flex-col gap-3 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Симбол эсвэл нэрээр хайх..."
          className="w-full rounded-2xl border border-app-border bg-app-card px-4 py-3 text-sm outline-none focus:border-brand placeholder:text-app-muted"
        />
        <div className="flex gap-2 text-xs overflow-x-auto">
          {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSignalFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${
                signalFilter === f
                  ? "bg-brand text-black"
                  : "bg-app-card border border-app-border text-app-muted"
              }`}
            >
              {f === "ALL"
                ? `Бүгд (${rows.length})`
                : f === "BUY"
                  ? `Авах (${counts.BUY})`
                  : f === "SELL"
                    ? `Зарах (${counts.SELL})`
                    : `Хүлээх (${counts.HOLD})`}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
        {filtered.map((row) => (
          <Link
            key={row.symbol}
            href={`/stock/${row.symbol}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-app-bg/60 transition-colors"
          >
            <StockAvatar symbol={row.symbol} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-app-text text-sm">
                  {row.symbol}
                </span>
                <SignalBadge signal={row.signal} size="sm" />
              </div>
              <div className="text-xs text-app-muted truncate">{row.name}</div>
            </div>
            <div className="flex items-center justify-center shrink-0 w-16">
              <Sparkline data={row.sparkline} positive={(row.changePct ?? 0) >= 0} />
            </div>
            {/* Units are dropped here: every row is ₮ and every change is a
                percent, so the suffixes only cost width the figures can use. */}
            <div className="text-right shrink-0">
              <div className="text-sm text-app-text">
                {row.lastPrice === null ? (
                  <span className="text-app-muted">—</span>
                ) : (
                  <Num value={row.lastPrice} digits={2} />
                )}
              </div>
              <div className="text-xs">
                <Pct value={row.changePct} suffix="" />
              </div>
              {/* A listing that hasn't traded for months still has a price;
                  without its date it reads as today's. */}
              {row.lastDate && row.lastDate !== session && (
                <div className="text-[10px] text-app-muted leading-none mt-0.5">
                  {row.lastDate}
                </div>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-app-muted text-sm">
            Илэрц олдсонгүй.
          </div>
        )}
      </div>
    </div>
  );
}
