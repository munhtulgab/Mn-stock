import type { GoldBasis } from "@/lib/analysis/goldBasis";

/**
 * The fundamental read on a fund that holds one thing.
 *
 * A company's fundamentals are its accounts: what it earned, what it owns,
 * what the market pays for a tögrög of either. A gold tracker files none of
 * that and never will, so the panel beside the scorecard was empty — not
 * because anything was broken, but because the question does not apply.
 *
 * Two questions do apply, and both are answerable from prices alone.
 *
 * What the metal has returned, over spans long enough to mean something —
 * which is what somebody deciding whether to hold gold at all is asking, and
 * what seventeen years of the bank's series can answer where three months of
 * the fund's cannot.
 *
 * And whether the fund is worth what it holds. A tracker's price should sit
 * near the value of its holdings; where it does not, the gap is the one thing
 * a buyer of this listing rather than of gold is paying or receiving. Both
 * sides are quoted in the same unit — the fund's price, and a hundredth of a
 * gram — so the difference is a percentage.
 */
export default function GoldFundamentals({ basis }: { basis: GoldBasis }) {
  const { premium, returns } = basis;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-app-text">Фундаментал шинжилгээ</h2>
        <span className="shrink-0 text-[10px] text-app-muted">Алтны ханш</span>
      </div>
      <p className="mb-3 text-[10px] text-app-muted">
        Сан нь компани биш тул санхүүгийн тайлан гаргадаггүй. Оронд нь эзэмшдэг
        металлынх нь өгөөж, сангийн ханш металлаас хэр зөрж байгааг харуулав.
      </p>

      {premium && (
        <div className="mb-3 rounded-xl bg-app-bg p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-app-muted">
              Металлаас зөрөх зөрүү
            </span>
            <span className="shrink-0 text-[10px] text-app-muted tabular-nums">
              {premium.date}
            </span>
          </div>
          <div
            className={`mt-0.5 text-lg font-semibold tabular-nums ${
              Math.abs(premium.premiumPct) < 1
                ? "text-app-text"
                : premium.premiumPct > 0
                  ? "text-app-negative"
                  : "text-app-positive"
            }`}
          >
            {premium.premiumPct > 0 ? "+" : ""}
            {premium.premiumPct.toFixed(2)}%
          </div>
          <div className="mt-1 text-[10px] leading-relaxed text-app-muted">
            Сангийн ханш {money(premium.price)} · алт (авах ÷100){" "}
            {money(premium.gold)}.{" "}
            {premium.premiumPct > 0
              ? "Сан эзэмшиж буй металлаасаа үнэтэй байна."
              : "Сан эзэмшиж буй металлаасаа хямд байна."}
            {premium.averagePct !== null && premium.days > 1 && (
              <>
                {" "}
                {premium.days} өдрийн дундаж зөрүү{" "}
                {premium.averagePct > 0 ? "+" : ""}
                {premium.averagePct.toFixed(2)}%.
              </>
            )}
          </div>
        </div>
      )}

      {returns.length > 0 && (
        <>
          <div className="mb-1.5 text-[10px] text-app-muted">Алтны өгөөж</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {returns.map((row) => (
              <div key={row.label} className="rounded-xl bg-app-bg p-2.5">
                <div className="text-[10px] text-app-muted">{row.label}</div>
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    row.totalPct >= 0 ? "text-app-positive" : "text-app-negative"
                  }`}
                >
                  {row.totalPct > 0 ? "+" : ""}
                  {row.totalPct.toFixed(1)}%
                </div>
                <div className="mt-0.5 text-[9px] leading-tight text-app-muted">
                  {row.annualPct === null
                    ? row.from
                    : `жилд ${row.annualPct > 0 ? "+" : ""}${row.annualPct.toFixed(1)}%`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-[10px] text-app-muted">
        Монголбанкны алт авах ханшаар, {basis.from} – {basis.to} ({basis.days}{" "}
        өдөр). Граммыг 100-д хуваасан.
      </p>
    </div>
  );
}

function money(value: number): string {
  return `${value.toLocaleString("mn-MN", { maximumFractionDigits: 0 })} ₮`;
}
