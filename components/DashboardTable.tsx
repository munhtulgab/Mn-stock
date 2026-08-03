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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Симбол эсвэл компанийн нэрээр хайх..."
          className="flex-1 min-w-[220px] rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <div className="flex gap-1 text-xs">
          {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSignalFilter(f)}
              className={`rounded-full px-3 py-1.5 border ${
                signalFilter === f
                  ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
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

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-left">
            <tr>
              <th
                className="px-3 py-2 cursor-pointer select-none"
                onClick={() => toggleSort("symbol")}
              >
                Симбол
              </th>
              <th className="px-3 py-2">Компани</th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right"
                onClick={() => toggleSort("lastPrice")}
              >
                Хаалтын ханш
              </th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right"
                onClick={() => toggleSort("changePct")}
              >
                Өөрчлөлт
              </th>
              <th
                className="px-3 py-2 cursor-pointer select-none text-right"
                onClick={() => toggleSort("score")}
              >
                Оноо
              </th>
              <th className="px-3 py-2">Санал</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.symbol}
                className="border-t border-neutral-800 hover:bg-neutral-900/60"
              >
                <td className="px-3 py-2 font-mono">
                  <Link href={`/stock/${row.symbol}`} className="hover:underline">
                    {row.symbol}
                  </Link>
                </td>
                <td className="px-3 py-2 text-neutral-300">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(row.lastPrice)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    row.changePct === null
                      ? "text-neutral-500"
                      : row.changePct > 0
                        ? "text-emerald-400"
                        : row.changePct < 0
                          ? "text-rose-400"
                          : "text-neutral-400"
                  }`}
                >
                  {row.changePct === null ? "—" : `${row.changePct > 0 ? "+" : ""}${formatNumber(row.changePct)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.score}</td>
                <td className="px-3 py-2">
                  <SignalBadge signal={row.signal} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
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
