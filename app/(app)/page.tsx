import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getDashboardRows } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import DashboardTable from "@/components/DashboardTable";
import StockAvatar from "@/components/StockAvatar";

export const dynamic = "force-dynamic";

function fmt(value: number, digits = 0): string {
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default async function HomePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const [rows, portfolio, watchlist] = await Promise.all([
    getDashboardRows(db),
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
  ]);

  const displayName = user?.fullName || user?.username || "";

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <p className="text-app-muted text-sm">Сайн байна уу,</p>
        <h1 className="text-xl font-bold text-app-text">{displayName}! 👋</h1>
      </div>

      <div className="rounded-3xl bg-linear-to-br from-brand to-brand-dark p-5 text-white">
        <div className="text-xs opacity-80 mb-1">Багцын үнэ цэнэ</div>
        <div className="text-3xl font-bold tabular-nums">{fmt(portfolio.totalValue)}₮</div>
        <div className="flex items-center gap-2 mt-2 text-sm">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              portfolio.todayGain >= 0 ? "bg-white/20" : "bg-black/20"
            }`}
          >
            {portfolio.todayGain >= 0 ? "▲" : "▼"} {fmt(Math.abs(portfolio.todayGain))}₮
          </span>
          <span className="opacity-80">өнөөдөр</span>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-app-text text-sm">Миний хөрөнгө</h2>
          <Link href="/portfolio" className="text-xs text-brand font-medium">
            Бүгдийг харах
          </Link>
        </div>
        {portfolio.holdings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-5 text-center text-sm text-app-muted">
            Одоогоор хувьцаа худалдаж аваагүй байна.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
            {portfolio.holdings.slice(0, 6).map((h) => (
              <Link
                key={h.symbol}
                href={`/stock/${h.symbol}`}
                className="shrink-0 w-36 rounded-2xl border border-app-border bg-app-card p-3"
              >
                <StockAvatar symbol={h.symbol} size={32} />
                <div className="mt-2 text-sm font-semibold text-app-text">{h.symbol}</div>
                <div className="text-xs text-app-muted">{fmt(h.marketValue)}₮</div>
                <div
                  className={`text-xs font-medium ${h.gainLoss >= 0 ? "text-app-positive" : "text-app-negative"}`}
                >
                  {h.gainLoss >= 0 ? "+" : ""}
                  {fmt(h.gainLossPct ?? 0, 1)}%
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-app-text text-sm">Хяналтын жагсаалт</h2>
        </div>
        {watchlist.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-5 text-center text-sm text-app-muted">
            Хяналтад компани нэмээгүй байна. Компанийн хуудаснаас ★ дарж нэмнэ үү.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
            {watchlist.map((w) => (
              <Link
                key={w.symbol}
                href={`/stock/${w.symbol}`}
                className="shrink-0 w-36 rounded-2xl border border-app-border bg-app-card p-3"
              >
                <StockAvatar symbol={w.symbol} size={32} />
                <div className="mt-2 text-sm font-semibold text-app-text">{w.symbol}</div>
                <div className="text-xs text-app-muted">{fmt(w.currentPrice ?? 0, 2)}₮</div>
                <div
                  className={`text-xs font-medium ${
                    (w.changePct ?? 0) >= 0 ? "text-app-positive" : "text-app-negative"
                  }`}
                >
                  {(w.changePct ?? 0) >= 0 ? "+" : ""}
                  {fmt(w.changePct ?? 0, 1)}%
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-app-text text-sm mb-3">Зах зээл</h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-app-border bg-app-card p-8 text-center text-app-muted text-sm">
            Өгөгдөл олдсонгүй.
          </div>
        ) : (
          <DashboardTable rows={rows} />
        )}
      </section>
    </div>
  );
}
