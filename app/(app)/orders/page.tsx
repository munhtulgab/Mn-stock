import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getTransactions } from "@/lib/portfolio";
import StockAvatar from "@/components/StockAvatar";
import Num from "@/components/Num";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const transactions = await getTransactions(db, user!._id!);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-app-text">Захиалгын түүх</h1>

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
          Одоогоор арилжаа хийгээгүй байна.{" "}
          <Link href="/" className="text-brand font-semibold">
            Зах зээл рүү очих
          </Link>
        </div>
      ) : (
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
                <div className="text-xs text-app-muted"><Num value={t.total} digits={2} suffix="₮" /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
