import StockAvatar from "./StockAvatar";
import Num from "./Num";
import type { Transaction } from "@/lib/types";

/**
 * Filled orders, newest first. Shared so the summary under the portfolio's
 * holdings and the full history page cannot drift apart.
 */
export default function TransactionList({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
      {transactions.map((t, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <StockAvatar symbol={t.symbol} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-app-text text-sm">{t.symbol}</span>
              <span
                className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                  t.side === "BUY"
                    ? "bg-app-positive-bg text-app-positive"
                    : "bg-app-negative-bg text-app-negative"
                }`}
              >
                {t.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
              </span>
            </div>
            <div className="text-xs text-app-muted">
              {new Date(t.createdAt).toLocaleString("mn-MN")}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm text-app-text">
              <span className="text-app-muted text-xs">{t.quantity} ш × </span>
              <Num value={t.price} digits={2} suffix="₮" />
            </div>
            <div className="text-xs text-app-muted">
              <Num value={t.total} digits={2} suffix="₮" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
