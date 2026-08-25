import Num from "@/components/Num";
import MetricInfo from "@/components/MetricInfo";
import type { DividendRow } from "@/lib/analysis/report";
import type { DividendEstimate } from "@/lib/dividends";

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
 * Four years of it, counted back from the year we are in. The full run is the
 * history card further down; this is the summary that belongs beside the
 * quarter's profit, and a company that has paid every year since it listed
 * would otherwise push the ratios above it off the top of the screen.
 *
 * Every one of the four gets a line whether or not it has a figure — including
 * the current year, which for most companies is a dash until the annual
 * meeting sits. That dash is the point. A company that paid in 2025 and not in
 * 2024 said something by not paying, and a list that quietly ends at whatever
 * year the company last paid leaves the reader unable to tell "has not
 * declared yet" from "this app has no figure for it".
 */
const YEARS_SHOWN = 4;

export default function DividendNotices({
  years,
  /** Today's year in Ulaanbaatar, read once on the server rather than here. */
  through,
  /**
   * Half the filed earnings, for the current year only, and only where the
   * company is in profit and has declared nothing yet. Worked out on the
   * server — see `estimatedDividend` — because it is arithmetic on the
   * statements rather than a fact about what was paid.
   */
  estimate = null,
}: {
  years: DividendRow[];
  through: number;
  estimate?: DividendEstimate | null;
}) {
  if (years.length === 0) return null;

  const declared = new Map(years.map((row) => [row.year, row]));
  const shown = Array.from({ length: YEARS_SHOWN }, (_, i) => through - i);

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
                ) : estimate && year === through ? (
                  /* In brackets and in the muted ink, because it is a sum and
                     not a declaration. The two together are the whole of what
                     marks it: a figure set like the ones above it would be
                     read as one, and this company has not said anything yet.
                     What the sum is is in the note behind the heading. */
                  <span className="text-app-muted">
                    (<Num value={estimate.amount} digits={2} suffix="₮" />
                    {estimate.yieldPct !== null && (
                      <>
                        {" · өгөөж "}
                        {estimate.yieldPct.toFixed(2)}%
                      </>
                    )}
                    )
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
