import Link from "next/link";
import type { PeerRow } from "@/lib/analysis/report";

/**
 * The sector as a league table, with this company shown in its place.
 *
 * Ranked by return on equity rather than by valuation: it is the one column
 * here that says how well the business is run rather than what the market
 * is charging for it, so it puts the sector in an order that means
 * something before the reader has compared anything themselves.
 */

/** Beyond this the table is a list; the rest is a tap away on each page. */
const SHOWN = 8;

function fmt(value: number | null, digits = 2, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${suffix}`;
}

export default function PeerTable({
  peers,
  sectorLabel,
  comparedToMarket,
}: {
  peers: PeerRow[];
  sectorLabel: string;
  comparedToMarket: boolean;
}) {
  if (peers.length < 2) return null;

  // The company's own row is always kept, even when it ranks below the cut:
  // a table that silently drops the share whose page it is on is worse than
  // a longer table.
  const top = peers.slice(0, SHOWN);
  const self = peers.find((p) => p.self);
  const rows = self && !top.includes(self) ? [...top, self] : top;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text">Салбарын харьцуулалт</h2>
        <span className="text-[10px] text-app-muted">
          {comparedToMarket ? "Зах зээл даяар" : sectorLabel}
        </span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-app-muted text-left">
              <th className="font-medium pb-1.5 pr-2">Хувьцаа</th>
              <th className="font-medium pb-1.5 px-2 text-right">P/E</th>
              <th className="font-medium pb-1.5 px-2 text-right">P/B</th>
              <th className="font-medium pb-1.5 pl-2 text-right">ROE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((peer) => (
              <tr
                key={peer.symbol}
                className={`border-t border-app-border/50 ${
                  peer.self ? "bg-brand-light" : ""
                }`}
              >
                <td className="py-1.5 pr-2">
                  {peer.self ? (
                    <span className="font-semibold text-brand">{peer.symbol}</span>
                  ) : (
                    <Link href={`/stock/${peer.symbol}`} className="text-app-text">
                      {peer.symbol}
                    </Link>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-app-muted">
                  {fmt(peer.pe)}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-app-muted">
                  {fmt(peer.pb)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-app-text">
                  {fmt(peer.roe, 2, "%")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
