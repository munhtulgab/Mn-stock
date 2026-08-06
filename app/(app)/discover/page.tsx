import { getDb } from "@/lib/mongodb";
import { applyLiveQuotes, getDashboardRows } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import DashboardTable from "@/components/DashboardTable";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const db = await getDb();
  const [storedRows, settings] = await Promise.all([
    getDashboardRows(db),
    getSettings(db),
  ]);
  const { rows } = await applyLiveQuotes(storedRows, {
    extraCaCerts: settings.extraCaCerts,
  });

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <PageHeader title="Зах зээл" />
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
