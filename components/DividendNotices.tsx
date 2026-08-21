import Num from "@/components/Num";
import MetricInfo from "@/components/MetricInfo";
import type { DividendRow } from "@/lib/analysis/report";

/**
 * What the company has declared per share, year by year.
 *
 * Lived inside the market panel until that card was removed. It belongs with
 * the financial statements rather than with the market data it sat beside: a
 * declared dividend is something the company decided, not something the board
 * did to its price.
 *
 * Same DividendRow[] the dividend-history table below reads, rather than a
 * separate fetch of its own — two different sources previously meant the two
 * cards could show different figures for the same year.
 *
 * Four years of it. The full run is the history card further down; this is
 * the summary that belongs beside the quarter's profit, and a company that
 * has paid every year since it listed would otherwise push the ratios above
 * it off the top of the screen.
 *
 * Every one of the four gets a line whether or not it has a figure. A company
 * that paid in 2025 and not in 2024 said something by not paying, and a list
 * that simply omits the year leaves the reader unable to tell that from a year
 * this app failed to read.
 */
const YEARS_SHOWN = 4;

export default function DividendNotices({ years }: { years: DividendRow[] }) {
  if (years.length === 0) return null;

  const declared = new Map(years.map((row) => [row.year, row]));
  // Counted back from the newest year on record rather than from the clock:
  // a page rendered in January would otherwise open on a year nobody has
  // declared anything for yet.
  const newest = Math.max(...years.map((row) => row.year));
  const shown = Array.from({ length: YEARS_SHOWN }, (_, i) => newest - i);

  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-app-muted mb-1 inline-flex items-center gap-1">
        Ногдол ашиг
        <MetricInfo term="dividend" />
      </h3>
      <ul className="space-y-1">
        {shown.map((year) => {
          const row = declared.get(year);
          return (
            <li key={year} className="flex justify-between gap-2 text-xs">
              <span className="text-app-muted">{year} он</span>
              <span className="shrink-0 tabular-nums">
                {row ? (
                  <span className="text-app-text">
                    <Num value={row.amount} digits={2} suffix="₮" />
                    {row.yieldPct !== null && (
                      <span className="text-app-muted">
                        {" · өгөөж "}
                        {row.yieldPct.toFixed(2)}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-app-muted">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
