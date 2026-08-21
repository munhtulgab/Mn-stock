import Num from "@/components/Num";
import type { DividendYear } from "@/lib/dividends";

/**
 * What the company has declared per share, year by year.
 *
 * Lived inside the market panel until that card was removed. It belongs with
 * the financial statements rather than with the market data it sat beside: a
 * declared dividend is something the company decided, not something the board
 * did to its price.
 *
 * A year the exchange announced nothing is a dash rather than a zero — the
 * two say different things, and only one of them is known.
 */
export default function DividendNotices({ years }: { years: DividendYear[] }) {
  if (years.length === 0) return null;

  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wide text-app-muted mb-1">
        Ногдол ашиг
      </h3>
      <ul className="space-y-1">
        {years.map((year) => (
          <li key={year.year} className="flex justify-between gap-2 text-xs">
            <span className="text-app-muted">{year.year} он</span>
            <span className="shrink-0 tabular-nums">
              {year.amount === null ? (
                <span className="text-app-muted">—</span>
              ) : (
                <span className="text-app-text">
                  <Num value={year.amount} digits={2} suffix="₮" />
                  {year.yieldPct !== null && (
                    <span className="text-app-muted">
                      {" · өгөөж "}
                      {year.yieldPct.toFixed(2)}%
                    </span>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
