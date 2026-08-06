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

export default function FundamentalPanel({
  ratios,
  period,
  sectorLabel,
  peerCount,
  comparedToMarket,
}: {
  ratios: RatioView[];
  period: string | null;
  sectorLabel: string;
  peerCount: number;
  comparedToMarket: boolean;
}) {
  const anyYoy = ratios.some((r) => r.yoy !== null);

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
        {/* Said plainly rather than left as a silently missing row: the
            exchange's summary publishes only balance-sheet totals, so there
            is nothing to compute a current ratio from. */}
        {" "}Хөрвөх чадварын харьцаа (Current Ratio) МХБ-ийн тайланд эргэлтийн
        хөрөнгө, богино хугацаат өр төлбөр тусдаа заагддаггүй тул тооцоолох
        боломжгүй.
      </p>
    </div>
  );
}
