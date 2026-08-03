import { getDb } from "@/lib/mongodb";
import { getDashboardRows } from "@/lib/data";
import DashboardTable from "@/components/DashboardTable";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const db = await getDb();
  const rows = await getDashboardRows(db);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-app-text">Зах зээл</h1>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-app-border bg-app-card p-8 text-center text-app-muted text-sm">
          Өгөгдөл олдсонгүй.
        </div>
      ) : (
        <DashboardTable rows={rows} />
      )}
    </div>
  );
}
