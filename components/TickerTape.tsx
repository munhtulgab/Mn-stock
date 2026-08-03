"use client";

import { useEffect, useState } from "react";
import type { DashboardRow } from "@/lib/data";

export default function TickerTape() {
  const [rows, setRows] = useState<DashboardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/securities")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRows(data.rows ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const withPrice = rows.filter((r) => r.lastPrice !== null);
  if (withPrice.length === 0) {
    return (
      <div className="h-8 border-b border-term-border bg-term-panel flex items-center px-4 text-[11px] text-term-muted overflow-hidden">
        ЗАГРУЖАЖ БАЙНА...
      </div>
    );
  }

  const items = [...withPrice, ...withPrice];

  return (
    <div className="h-8 border-b border-term-border bg-term-panel overflow-hidden whitespace-nowrap relative">
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-term-panel to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-term-panel to-transparent z-10" />
      <div className="inline-flex items-center h-8 animate-ticker">
        {items.map((r, i) => (
          <span
            key={`${r.symbol}-${i}`}
            className="inline-flex items-center gap-1.5 px-4 text-[11px] tabular-nums shrink-0"
          >
            <span className="text-term-amber font-semibold">{r.symbol}</span>
            <span className="text-term-text">{r.lastPrice?.toFixed(2)}</span>
            <span
              className={
                r.changePct === null
                  ? "text-term-muted"
                  : r.changePct > 0
                    ? "text-term-green"
                    : r.changePct < 0
                      ? "text-term-red"
                      : "text-term-muted"
              }
            >
              {r.changePct === null
                ? "—"
                : `${r.changePct > 0 ? "▲" : r.changePct < 0 ? "▼" : "▬"} ${Math.abs(r.changePct).toFixed(2)}%`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
