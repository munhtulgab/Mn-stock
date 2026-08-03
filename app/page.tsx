import { getDb } from "@/lib/mongodb";
import { getDashboardRows } from "@/lib/data";
import DashboardTable from "@/components/DashboardTable";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getDb();
  const rows = await getDashboardRows(db);
  const withPrice = rows.filter((r) => r.lastPrice !== null).length;
  const buy = rows.filter((r) => r.signal === "BUY").length;
  const sell = rows.filter((r) => r.signal === "SELL").length;
  const hold = rows.filter((r) => r.signal === "HOLD").length;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4">
      <div className="flex items-baseline justify-between mb-3 border-b border-term-border pb-2">
        <h1 className="text-base font-bold uppercase tracking-wider text-term-amber">
          EQUITY MONITOR // MSE
        </h1>
        <span className="text-[11px] text-term-muted">
          {rows.length} SECURITIES · {withPrice} PRICED
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-term-border mb-4 border border-term-border">
        <StatBlock label="BUY" value={buy} className="text-term-green" />
        <StatBlock label="SELL" value={sell} className="text-term-red" />
        <StatBlock label="HOLD" value={hold} className="text-term-yellow" />
      </div>

      {rows.length === 0 ? (
        <div className="border border-term-border bg-term-panel p-8 text-center text-term-muted text-sm">
          Өгөгдөл олдсонгүй. Эхлээд <code className="text-term-amber">/api/sync</code>{" "}
          endpoint-г дуудаж MSE-ийн өгөгдлийг татна уу.
        </div>
      ) : (
        <DashboardTable rows={rows} />
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="bg-term-panel px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-term-muted mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
