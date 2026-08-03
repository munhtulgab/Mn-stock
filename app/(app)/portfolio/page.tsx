import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary } from "@/lib/portfolio";
import StockAvatar from "@/components/StockAvatar";

export const dynamic = "force-dynamic";

function fmt(value: number, digits = 0): string {
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default async function PortfolioPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const portfolio = await getPortfolioSummary(db, user!._id!);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-xl font-bold text-app-text">Багц</h1>

      <div className="rounded-3xl bg-app-card border border-app-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-app-muted">Нийт үнэ цэнэ</div>
            <div className="text-2xl font-bold tabular-nums text-app-text">
              {fmt(portfolio.totalValue)}₮
            </div>
          </div>
          <div
            className={`text-right text-sm font-semibold ${
              portfolio.todayGain >= 0 ? "text-app-positive" : "text-app-negative"
            }`}
          >
            <div>
              {portfolio.todayGain >= 0 ? "▲" : "▼"} {fmt(Math.abs(portfolio.todayGain))}₮
            </div>
            <div className="text-xs font-normal text-app-muted">өнөөдөр</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-app-border">
          <div>
            <div className="text-xs text-app-muted">Бэлэн мөнгө</div>
            <div className="text-sm font-semibold tabular-nums text-app-text">
              {fmt(portfolio.cashBalance)}₮
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Хувьцааны үнэ цэнэ</div>
            <div className="text-sm font-semibold tabular-nums text-app-text">
              {fmt(portfolio.holdingsValue)}₮
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Нийт ашиг/алдагдал</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                portfolio.totalGainLoss >= 0 ? "text-app-positive" : "text-app-negative"
              }`}
            >
              {portfolio.totalGainLoss >= 0 ? "+" : ""}
              {fmt(portfolio.totalGainLoss)}₮
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Ашгийн хувь</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                (portfolio.totalGainLossPct ?? 0) >= 0 ? "text-app-positive" : "text-app-negative"
              }`}
            >
              {portfolio.totalGainLossPct === null
                ? "—"
                : `${portfolio.totalGainLossPct >= 0 ? "+" : ""}${fmt(portfolio.totalGainLossPct, 2)}%`}
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="font-semibold text-app-text text-sm mb-3">Хувьцаанууд</h2>
        {portfolio.holdings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
            Одоогоор хувьцаа худалдаж аваагүй байна.{" "}
            <Link href="/" className="text-brand font-semibold">
              Зах зээл рүү очих
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
            {portfolio.holdings.map((h) => (
              <Link
                key={h.symbol}
                href={`/stock/${h.symbol}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-app-bg/60"
              >
                <StockAvatar symbol={h.symbol} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-app-text text-sm">{h.symbol}</div>
                  <div className="text-xs text-app-muted">
                    {h.quantity} ширхэг · дундаж {fmt(h.avgCost, 2)}₮
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums text-app-text">
                    {fmt(h.marketValue)}₮
                  </div>
                  <div
                    className={`text-xs font-medium tabular-nums ${
                      h.gainLoss >= 0 ? "text-app-positive" : "text-app-negative"
                    }`}
                  >
                    {h.gainLoss >= 0 ? "+" : ""}
                    {fmt(h.gainLossPct ?? 0, 1)}%
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
