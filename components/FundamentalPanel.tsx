import type { RatioView, Standing } from "@/lib/analysis/fundamentals";

/**
 * The valuation ratios, each against its sector's median.
 *
 * Green beats the sector, amber is level with it, red trails it — and which
 * way counts as beating differs by ratio, so the direction is spelled out in
 * the header rather than left for the reader to infer from a colour. A row
 * the exchange did not publish is a dash in every column, never a zero.
 */

const STANDING_STYLES: Record<Standing, string> = {
  good: "text-app-positive",
  fair: "text-app-warn",
  poor: "text-app-negative",
};

function format(value: number | null, digits: number, suffix?: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const text = value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return suffix ? `${text}${suffix === "%" ? "" : " "}${suffix}` : text;
}

/**
 * Where a price sits between its own extremes, as a percentage.
 *
 * Null unless all three figures are known and the range has width: a company
 * that has traded at one price all year has no position within a range, and
 * dividing by that zero would report either infinity or a confident 0%.
 */
export function rangePosition(
  price: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (price === null || low === null || high === null) return null;
  if (!(high > low)) return null;
  return ((price - low) / (high - low)) * 100;
}

export default function FundamentalPanel({
  ratios,
  period,
  sectorLabel,
  peerCount,
  comparedToMarket,
  price,
  weekHigh52,
  weekLow52,
}: {
  ratios: RatioView[];
  period: string | null;
  sectorLabel: string;
  peerCount: number;
  comparedToMarket: boolean;
  /** The last traded price, for placing it within the year's range. */
  price?: number | null;
  weekHigh52?: number | null;
  weekLow52?: number | null;
}) {
  const anyYoy = ratios.some((r) => r.yoy !== null);
  const high = weekHigh52 ?? null;
  const low = weekLow52 ?? null;
  const position = rangePosition(price ?? null, low, high);

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-app-text">
          Фундаментал шинжилгээ
        </h2>
        {period && <span className="text-[10px] text-app-muted">{period}</span>}
      </div>

      {/* Which companies the medians are of. A percentile means nothing
          without it, and when the sector was too small to use, that is said
          rather than quietly swapped. */}
      <p className="text-[11px] text-app-muted mb-3">
        {peerCount === 0
          ? "Харьцуулах компани олдсонгүй."
          : comparedToMarket
            ? `Салбарын мэдээлэл хүрэлцэхгүй тул зах зээлийн ${peerCount + 1} хувьцаатай харьцуулав.`
            : `${sectorLabel} · ${peerCount + 1} харьцуулсан хувьцаа`}
      </p>

      {/* The year's extremes, and what they say about today's price.
          Moved here from the market card: a company's own trading range is
          part of what the reader is valuing it against, and the number that
          matters is not either end but where the price stands between them —
          a P/E of nine reads differently at the top of the year than at the
          bottom. */}
      {high !== null && low !== null && (
        <div className="mb-3 rounded-xl bg-app-bg p-3">
          <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
            <span className="text-app-muted">{format(low, 2, "₮")}</span>
            <span className="text-[10px] text-app-muted">
              52 долоо хоногийн муж
              {position !== null && (
                <span className="text-app-text">
                  {" · "}
                  {position.toFixed(0)}%
                </span>
              )}
            </span>
            <span className="text-app-muted">{format(high, 2, "₮")}</span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-app-elevated">
            {position !== null && (
              // Clamped: a price outside the stated range — the extremes are
              // a session behind the live quote — would put the marker off
              // the end of its own track.
              <div
                className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-brand"
                style={{ left: `${Math.min(Math.max(position, 0), 100)}%` }}
              />
            )}
          </div>
          {position !== null && (
            <p className="mt-1.5 text-[10px] text-app-muted">
              {position >= 80
                ? "Жилийн дээд хязгаартаа ойрхон арилжаалагдаж байна."
                : position <= 20
                  ? "Жилийн доод хязгаартаа ойрхон арилжаалагдаж байна."
                  : "Жилийн мужийнхаа дунд хэсэгт арилжаалагдаж байна."}
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-app-muted text-left">
              <th className="font-medium pb-1.5 pr-2">Үзүүлэлт</th>
              <th className="font-medium pb-1.5 px-2 text-right">Утга</th>
              <th className="font-medium pb-1.5 px-2 text-right whitespace-nowrap">
                Салбарын дундаж
              </th>
              {anyYoy && (
                <th className="font-medium pb-1.5 px-2 text-right whitespace-nowrap">
                  Өмнөх он
                </th>
              )}
              <th className="font-medium pb-1.5 pl-2 text-right">Байр</th>
            </tr>
          </thead>
          <tbody>
            {ratios.map((ratio) => (
              <tr key={ratio.key} className="border-t border-app-border/50">
                <td className="py-1.5 pr-2 text-app-muted">
                  {ratio.label}
                  {/* Which way is good, so a colour is readable rather than
                      something to be taken on faith. */}
                  <span className="text-[9px] text-app-muted/70 ml-1">
                    {ratio.direction === "lower" ? "↓ сайн" : "↑ сайн"}
                  </span>
                  {/* Marked because it is a different vintage: MSE's figures
                      are this quarter, Datalab's are the last closed year. */}
                  {ratio.external && (
                    <span className="text-[9px] text-app-muted/70 ml-1">· TDB</span>
                  )}
                </td>
                <td
                  className={`py-1.5 px-2 text-right tabular-nums font-semibold ${
                    ratio.standing ? STANDING_STYLES[ratio.standing] : "text-app-text"
                  }`}
                >
                  {format(ratio.value, ratio.digits, ratio.suffix)}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums text-app-muted">
                  {format(ratio.sectorMedian, ratio.digits, ratio.suffix)}
                </td>
                {anyYoy && (
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {ratio.yoy === null ? (
                      <span className="text-app-muted">—</span>
                    ) : (
                      <span
                        className={
                          // Up is good except where the ratio reads the other
                          // way: a falling P/E is a cheapening share.
                          (ratio.direction === "lower" ? -ratio.yoy : ratio.yoy) >= 0
                            ? "text-app-positive"
                            : "text-app-negative"
                        }
                      >
                        {ratio.yoy >= 0 ? "+" : ""}
                        {format(ratio.yoy, ratio.digits)}
                      </span>
                    )}
                  </td>
                )}
                <td className="py-1.5 pl-2 text-right tabular-nums text-app-muted">
                  {ratio.percentile === null
                    ? "—"
                    : `${ratio.percentile.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-app-muted">
        Байр — салбартаа эзлэх байрлал (100% нь хамгийн сайн). Салбарын
        дунджаас ±10% дотор бол шар.
        {/* Said rather than left to be noticed: two vintages sit in one
            table, and a reader comparing a P/E with a current ratio should
            know they are not describing the same moment. */}
        {" "}TDB тэмдэгтэй мөр нь МХБ нийтэлдэггүй тул TDB Datalab-ийн сүүлийн
        хаагдсан жилийн тайлангаас авав; бусад нь МХБ-ийн энэ улирлынх.
      </p>
    </div>
  );
}
