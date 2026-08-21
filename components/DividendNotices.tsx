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
 */
export default function DividendNotices({ years }: { years: DividendRow[] }) {
  if (years.length === 0) return null;

  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-app-muted mb-1 inline-flex items-center gap-1">
        Ногдол ашиг
        <MetricInfo term="dividend" />
      </h3>
      <ul className="space-y-1">
        {years.map((year) => (
          <li key={year.year} className="flex justify-between gap-2 text-xs">
            <span className="text-app-muted">{year.year} он</span>
            <span className="shrink-0 tabular-nums">
              <span className="text-app-text">
                <Num value={year.amount} digits={2} suffix="₮" />
                {year.yieldPct !== null && (
                  <span className="text-app-muted">
                    {" · өгөөж "}
                    {year.yieldPct.toFixed(2)}%
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
