import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getTransactions } from "@/lib/portfolio";
import TransactionList from "@/components/TransactionList";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const transactions = await getTransactions(db, user!._id!);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      {/* Reached from the portfolio rather than the tab bar, so it carries
          its own way back. */}
      <Link href="/portfolio" className="text-sm text-app-muted">
        ← Багц
      </Link>
      <h1 className="text-xl font-bold text-app-text">Захиалгын түүх</h1>

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
          Одоогоор арилжаа хийгээгүй байна.{" "}
          <Link href="/" className="text-brand font-semibold">
            Зах зээл рүү очих
          </Link>
        </div>
      ) : (
        <TransactionList transactions={transactions} />
      )}
    </div>
  );
}
