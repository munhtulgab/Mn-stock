"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardRow } from "@/lib/data";
import SignalBadge from "./SignalBadge";

type SortKey = "symbol" | "lastPrice" | "changePct" | "score";

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const [query, setQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<"ALL" | DashboardRow["signal"]>(
    "ALL",
  );
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

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

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const counts = useMemo(
    () => ({
      BUY: rows.filter((r) => r.signal === "BUY").length,
      SELL: rows.filter((r) => r.signal === "SELL").length,
      HOLD: rows.filter((r) => r.signal === "HOLD").length,
    }),
    [rows],
  );

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return null;
    return <span className="text-term-amber ml-0.5">{sortDir === 1 ? "▲" : "▼"}</span>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH SYMBOL / NAME..."
          className="flex-1 min-w-[220px] bg-black border border-term-border px-3 py-1.5 text-xs uppercase tracking-wide outline-none focus:border-term-amber placeholder:text-term-muted"
        />
        <div className="flex gap-1 text-[11px] uppercase tracking-wider">
          {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSignalFilter(f)}
              className={`px-2.5 py-1.5 border ${
                signalFilter === f
                  ? "border-term-amber bg-term-amber text-black font-bold"
                  : "border-term-border text-term-muted hover:border-term-amber hover:text-term-amber"
              }`}
            >
              {f === "ALL"
                ? `ALL (${rows.length})`
                : f === "BUY"
                  ? `BUY (${counts.BUY})`
                  : f === "SELL"
                    ? `SELL (${counts.SELL})`
                    : `HOLD (${counts.HOLD})`}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border border-term-border">
        <table className="w-full text-xs">
          <thead className="bg-term-panel text-term-amber text-left uppercase tracking-wider">
            <tr>
              <th
                className="px-3 py-2 cursor-pointer select-none border-b border-term-border"
                onClick={() => toggleSort("symbol")}
              >
                Symbol{sortIndicator("symbol")}
              </th>
              <th className="px-3 py-2 border-b border-term-border">Компани</th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right border-b border-term-border"
                onClick={() => toggleSort("lastPrice")}
              >
                Last{sortIndicator("lastPrice")}
              </th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right border-b border-term-border"
                onClick={() => toggleSort("changePct")}
              >
                Chg%{sortIndicator("changePct")}
              </th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right border-b border-term-border"
                onClick={() => toggleSort("score")}
              >
                Score{sortIndicator("score")}
              </th>
              <th className="px-3 py-2 border-b border-term-border">Signal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={row.symbol}
                className={`border-b border-term-border hover:bg-term-amber/5 ${i % 2 === 0 ? "bg-black" : "bg-term-panel"}`}
              >
                <td className="px-3 py-1.5 font-bold text-term-amber">
                  <Link href={`/stock/${row.symbol}`} className="hover:underline">
                    {row.symbol}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-term-text truncate max-w-[220px]">
                  {row.name}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-term-text">
                  {formatNumber(row.lastPrice)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                    row.changePct === null
                      ? "text-term-muted"
                      : row.changePct > 0
                        ? "text-term-green"
                        : row.changePct < 0
                          ? "text-term-red"
                          : "text-term-muted"
                  }`}
                >
                  {row.changePct === null ? "—" : `${row.changePct > 0 ? "+" : ""}${formatNumber(row.changePct)}%`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-term-text">
                  {row.score}
                </td>
                <td className="px-3 py-1.5">
                  <SignalBadge signal={row.signal} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-term-muted">
                  Илэрц олдсонгүй.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
