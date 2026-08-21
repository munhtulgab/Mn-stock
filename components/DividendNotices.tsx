import MetricInfo from "@/components/MetricInfo";
import type { DividendRow } from "@/lib/analysis/report";

/**
 * What has been declared per share over the last few years.
 *
 * The same figures the dividend history card below draws, cut to four years:
 * this is the summary a reader wants beside the quarter's profit — did any of
 * it reach them — and the full run is a card of its own further down.
 *
 * Every one of the four years gets a line whether or not it has a figure. A
 * company that paid in 2025 and not in 2024 said something by not paying, and
 * a list that simply omits the year leaves the reader unable to tell that from
 * a year this app failed to read.
 */
const YEARS_SHOWN = 4;

export default function DividendNotices({
  dividends,
}: {
  dividends: DividendRow[];
}) {
  const declared = new Map(dividends.map((row) => [row.year, row]));
  // Counted back from the newest year either source knows about rather than
  // from the clock: a server rendering this in January would otherwise open
  // with a year nobody has declared anything for yet.
  const newest = dividends.length > 0 ? Math.max(...dividends.map((d) => d.year)) : null;
  if (newest === null) return null;

  const years = Array.from({ length: YEARS_SHOWN }, (_, i) => newest - i);

  return (
    <div>
      <h3 className="text-xs font-bold text-app-text mb-1.5">Ногдол ашиг</h3>
      <dl className="space-y-1">
        {years.map((year) => {
          const row = declared.get(year);
          return (
            <div key={year} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-app-muted">{year} он</dt>
              <dd className="flex items-baseline gap-0.5 text-right tabular-nums text-app-text">
                <span>
                  {row ? (
                    <>
                      {row.amount.toLocaleString("mn-MN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      ₮
                      {row.yieldPct !== null && (
                        <span className="text-app-muted">
                          {" · өгөөж "}
                          {row.yieldPct.toFixed(2)}%
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-app-muted">—</span>
                  )}
                </span>
                <MetricInfo term="dividend" />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
