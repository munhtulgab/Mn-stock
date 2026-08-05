import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getTransactions } from "@/lib/portfolio";
import StockAvatar from "@/components/StockAvatar";
import TransactionList from "@/components/TransactionList";
import Num, { Pct } from "@/components/Num";
import PageHeader from "@/components/PageHeader";

/**
 * Enough to see this week's activity without turning the portfolio into a
 * ledger; the rest is one tap away.
 */
const RECENT_ORDERS = 10;

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const [portfolio, transactions] = await Promise.all([
    getPortfolioSummary(db, user!._id!),
    getTransactions(db, user!._id!),
  ]);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <PageHeader title="Багц" />

      <div className="rounded-3xl bg-app-card border border-app-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-app-muted">Нийт үнэ цэнэ</div>
            <div className="text-2xl text-app-text">
              <Num value={portfolio.totalValue} digits={2} suffix="₮" />
            </div>
          </div>
          <div
            className={`text-right text-sm font-semibold ${
              portfolio.todayGain >= 0 ? "text-app-positive" : "text-app-negative"
            }`}
          >
            <div>
              <Num value={portfolio.todayGain} digits={2} suffix="₮" showSign />
            </div>
            <div className="text-xs font-normal text-app-muted">өнөөдөр</div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-app-border">
          <div>
            <div className="text-xs text-app-muted">Бэлэн мөнгө</div>
            <div className="text-sm text-app-text">
              <Num value={portfolio.cashBalance} digits={2} suffix="₮" />
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Хувьцааны үнэ цэнэ</div>
            <div className="text-sm text-app-text">
              <Num value={portfolio.holdingsValue} digits={2} suffix="₮" />
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Нийт ашиг/алдагдал</div>
            <div
              className={`text-sm ${
                portfolio.totalGainLoss >= 0 ? "text-app-positive" : "text-app-negative"
              }`}
            >
              <Num value={portfolio.totalGainLoss} digits={2} suffix="₮" showSign />
            </div>
          </div>
          <div>
            <div className="text-xs text-app-muted">Ашгийн хувь</div>
            <div className="text-sm">
              <Pct value={portfolio.totalGainLossPct} />
            </div>
          </div>
        </div>
      </div>

      {/* Holdings and the trades that produced them, side by side once there
          is room for both. */}
      <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
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
                    {h.quantity} ширхэг · дундаж {h.avgCost.toFixed(2)}₮
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-app-text">
                    <Num value={h.marketValue} digits={2} suffix="₮" />
                  </div>
                  <div className="text-xs">
                    <Pct value={h.gainLossPct} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Directly under the holdings: a trade is the other half of a
          position, and reading one without the other means leaving the page. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-app-text text-sm">Захиалгын түүх</h2>
          {transactions.length > RECENT_ORDERS && (
            <Link href="/orders" className="text-xs text-brand font-medium">
              Бүгдийг харах ({transactions.length})
            </Link>
          )}
        </div>
        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
            Одоогоор арилжаа хийгээгүй байна.
          </div>
        ) : (
          <TransactionList transactions={transactions.slice(0, RECENT_ORDERS)} />
        )}
      </section>
      </div>
    </div>
  );
}
