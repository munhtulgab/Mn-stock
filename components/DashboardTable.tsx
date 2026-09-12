"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardRow } from "@/lib/data";
import { byLatestThenScore } from "@/lib/marketOrder";
import SignalBadge from "./SignalBadge";
import Sparkline from "./Sparkline";
import StockAvatar from "./StockAvatar";
import Num, { Pct } from "./Num";
import { SearchIcon } from "./icons";

/** The same solid glyphs SignalBadge uses, so a filter looks like its rows. */
const FILTER_ICONS: Record<string, React.ReactNode> = {
  ALL: <circle cx="6" cy="6" r="4" />,
  BUY: <path d="M6 2 10.5 9.5h-9z" />,
  SELL: <path d="M6 10 1.5 2.5h9z" />,
  HOLD: <rect x="1.5" y="5" width="9" height="2" rx="1" />,
};

export default function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const [query, setQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<"ALL" | DashboardRow["signal"]>(
    "ALL",
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows.filter(
      (r) =>
        !q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
    if (signalFilter !== "ALL") {
      result = result.filter((r) => r.signal === signalFilter);
    }
    // The latest session first, best score within it — see byLatestThenScore
    // for why the date leads. There is no control for this: the state that
    // used to hold a sort key and a direction had no setter and never held
    // anything but the score.
    return [...result].sort(byLatestThenScore);
  }, [rows, query, signalFilter]);

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
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-app-muted">
            <SearchIcon size={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Симбол эсвэл нэрээр хайх..."
            className="w-full rounded-2xl border border-app-border bg-app-card pl-11 pr-4 py-3 text-sm outline-none focus:border-brand placeholder:text-app-muted"
          />
        </div>
        <div className="flex gap-2 text-xs overflow-x-auto">
          {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSignalFilter(f)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${
                signalFilter === f
                  ? "bg-brand text-black"
                  : "bg-app-card border border-app-border text-app-muted"
              }`}
            >
              <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor" aria-hidden>
                {FILTER_ICONS[f]}
              </svg>
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

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
        {/* Named once at the top rather than on every row, which is what a
            table is for and what the phone has no width to do. */}
        <div className="hidden lg:flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wide text-app-muted">
          <span className="w-10 shrink-0" />
          <span className="flex-1">Компани</span>
          <span className="w-20 text-right">Оноо</span>
          <span className="w-28 text-right">Ширхэг</span>
          <span className="w-32 text-center">Чиг хандлага</span>
          <span className="w-28 text-right">Ханш</span>
        </div>
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
                {row.signal && <SignalBadge signal={row.signal} size="sm" />}
              </div>
              <div className="text-xs text-app-muted truncate">{row.name}</div>
            </div>
            {/* Room on a wide screen for what the phone has to leave out:
                the score behind the badge, the day's turnover, and a longer
                trend line than a 56px stub. */}
            <div className="hidden lg:block shrink-0 w-20 text-right text-sm tabular-nums text-app-text">
              {row.score ?? "—"}
            </div>
            <div className="hidden lg:block shrink-0 w-28 text-right text-sm tabular-nums text-app-text">
              {row.volume === null ? "—" : <Num value={row.volume} digits={0} />}
            </div>
            <div className="shrink-0 w-16 lg:w-32">
              <Sparkline
                data={row.sparkline}
                positive={(row.changePct ?? 0) >= 0}
                width={56}
                height={24}
                fill
              />
            </div>
            {/* Both units, on both lines. They were dropped to buy width for
                the figures, on the reasoning that every price on the board is
                in tugriks and every change is a percent — true of the column,
                but a row is read one row at a time, and a bare 1,585,500 over
                a bare +0.27 is two numbers with nothing saying what either
                one measures.

                They cost about ten pixels of a 112px column on a wide screen
                and are inside it; on a phone the block is only as wide as it
                needs to be and the company name gives up the difference. */}
            <div className="text-right shrink-0 lg:w-28">
              <div className="text-sm text-app-text">
                {row.lastPrice === null ? (
                  <span className="text-app-muted">—</span>
                ) : (
                  <Num value={row.lastPrice} digits={2} suffix="₮" />
                )}
              </div>
              <div className="text-xs">
                <Pct value={row.changePct} />
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
