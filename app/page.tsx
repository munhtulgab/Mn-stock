import { getDb } from "@/lib/mongodb";
import { getDashboardRows } from "@/lib/data";
import DashboardTable from "@/components/DashboardTable";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getDb();
  const rows = await getDashboardRows(db);
  const withPrice = rows.filter((r) => r.lastPrice !== null).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-1">
        МХБ-д бүртгэлтэй компаниудын ханшийн санал
      </h1>
      <p className="text-sm text-neutral-400 mb-6">
        {rows.length} компанийн мэдээллээс {withPrice}-д нь техник болон
        санхүүгийн шинжилгээгээр тооцоолсон дохио. Симбол дээр дарж дэлгэрэнгүй
        шинжилгээ болон AI дүн шинжилгээг харна уу.
      </p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
          Өгөгдөл олдсонгүй. Эхлээд <code className="text-neutral-200">/api/sync</code>{" "}
          endpoint-г дуудаж MSE-ийн өгөгдлийг татна уу.
        </div>
      ) : (
        <DashboardTable rows={rows} />
      )}
    </div>
  );
}
