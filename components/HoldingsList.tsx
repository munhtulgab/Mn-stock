"use client";

import Link from "next/link";
import { useState } from "react";
import {
  HOLDING_ORDERS,
  sortHoldings,
  type HoldingOrder,
  type HoldingView,
} from "@/lib/holdings";
import StockAvatar from "./StockAvatar";
import Num, { Pct } from "./Num";

/**
 * The positions, in whichever order answers the question being asked.
 *
 * Two orders, because there are two questions. "What is most of my money in?"
 * is answered by market value, and it is the one a portfolio is normally read
 * for — so it is the default. "What is actually working?" is answered by gain,
 * and a list sorted by size will not show it: a small holding up 40% sits at
 * the bottom, under four large ones that have gone nowhere.
 *
 * Tapping the order already in force turns it round. Largest-first is the
 * useful direction for both, but the other end is where the questions worth
 * acting on live — the position that has lost the most, the one too small to
 * matter any more.
 */

const LABEL: Record<HoldingOrder, string> = {
  value: "Дүнгээр",
  gain: "Ашгаар",
};

export default function HoldingsList({ holdings }: { holdings: HoldingView[] }) {
  const [key, setKey] = useState<HoldingOrder>("value");
  const [descending, setDescending] = useState(true);

  function choose(next: HoldingOrder) {
    if (next === key) {
      setDescending((d) => !d);
      return;
    }
    setKey(next);
    // A newly chosen order starts at its useful end rather than inheriting
    // the direction the previous one happened to be left in.
    setDescending(true);
  }

  const sorted = sortHoldings(holdings, key, descending);

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-app-text text-sm">Хувьцаанууд</h2>
        <div className="flex items-center gap-1 shrink-0">
          {HOLDING_ORDERS.map((option) => {
            const active = option === key;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-app-border text-app-muted"
                }`}
              >
                {LABEL[option]}
                {/* The arrow only appears on the order in force: on the other
                    one it would promise a direction that tapping does not
                    give, since a fresh choice always starts largest-first. */}
                {active && (
                  <span aria-hidden className={descending ? "" : "rotate-180"}>
                    ▾
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
        {sorted.map((h) => (
          <Link
            key={h.symbol}
            href={`/stock/${h.symbol}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-app-bg/60"
          >
            <StockAvatar symbol={h.symbol} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-app-text text-sm">{h.symbol}</div>
              <div className="text-xs text-app-muted">
                {h.quantity} ширхэг · дундаж {h.avgCost.toFixed(2)}₮
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm text-app-text">
                <Num value={h.marketValue} digits={2} suffix="₮" />
              </div>
              <div className="text-xs flex items-center justify-end gap-1.5">
                {/* Both, now that the list can be ordered by either: sorting
                    by a figure that is not on screen leaves the reader
                    unable to see why the order came out as it did. */}
                <span
                  className={`tabular-nums ${
                    h.gainLoss >= 0 ? "text-app-positive" : "text-app-negative"
                  }`}
                >
                  <Num value={h.gainLoss} digits={0} suffix="₮" showSign />
                </span>
                <Pct value={h.gainLossPct} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
