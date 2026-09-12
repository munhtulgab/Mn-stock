import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { getAdminOverview } from "@/lib/adminOverview";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import StatCard from "@/components/admin/StatCard";
import SyncButton from "@/components/admin/SyncButton";

export const dynamic = "force-dynamic";

/**
 * What the installation looks like from the inside: how many people use it,
 * what they have traded, and whether the machinery behind it is configured.
 *
 * No prices anywhere. An administrator wanting to know what the market did
 * opens the app, which is one link away in the header.
 */
export default async function AdminOverviewPage() {
  const db = await getDb();
  await requireAdminPage(db);
  const o = await getAdminOverview(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-app-text">Хяналтын самбар</h1>
        <p className="text-sm text-app-muted">Системийн болон хэрэглэгчийн ерөнхий байдал</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Хэрэглэгч"
          value={o.users.total}
          hint={`${o.users.admins || 1} админ · 7 хоногт +${o.users.recent}`}
        />
        <StatCard
          label="Нэвтэрсэн сешн"
          value={o.users.sessions}
          hint="Хүчинтэй хугацаа дуусаагүй"
        />
        <StatCard
          label="Захиалга"
          value={o.orders.total}
          hint={`${o.orders.buys} авсан · ${o.orders.sells} зарсан`}
        />
        <StatCard
          label="Мэдэгдэл"
          value={o.alerts.total}
          hint={
            o.alerts.lastAt
              ? `сүүлийнх ${ulaanbaatarDateTime(o.alerts.lastAt)}`
              : "хараахан алга"
          }
        />
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-app-border bg-app-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-app-text">Сүүлийн захиалгууд</h2>
            <Link href="/admin/users" className="text-xs font-semibold text-brand">
              Хэрэглэгчид →
            </Link>
          </div>
          {o.latestOrders.length === 0 ? (
            <p className="text-sm text-app-muted">Хараахан арилжаа хийгдээгүй байна.</p>
          ) : (
            <div className="divide-y divide-app-divider">
              {o.latestOrders.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/users/${t.userId}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      t.side === "BUY"
                        ? "bg-app-positive-bg text-app-positive"
                        : "bg-app-negative-bg text-app-negative"
                    }`}
                  >
                    {t.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
                  </span>
                  <span className="font-semibold text-app-text text-sm">{t.symbol}</span>
                  <span className="text-xs text-app-muted">{t.quantity} ш</span>
                  <span className="ml-auto text-right">
                    <span className="block text-sm text-app-text">
                      <Num value={t.total} digits={0} suffix="₮" />
                    </span>
                    <span className="block text-xs text-app-muted">
                      @{t.username} · {ulaanbaatarDateTime(t.createdAt)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-app-border bg-app-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-app-text">Систем</h2>
            <dl className="space-y-2 text-sm">
              <Row label="AI түлхүүр" value={`${o.system.aiKeys}/${o.system.aiKeysPossible}`} />
              <Row label="Мэдээллийн эх сурвалж" value={String(o.system.newsSources)} />
              <Row label="Push мэдэгдэл" value={o.system.pushEnabled ? "Идэвхтэй" : "Унтраалттай"} />
              <Row label="SMS" value={o.system.smsEnabled ? "Идэвхтэй" : "Унтраалттай"} />
              <Row
                label="Сүүлийн синк"
                value={
                  o.system.lastSecuritiesSyncAt
                    ? ulaanbaatarDateTime(o.system.lastSecuritiesSyncAt)
                    : "—"
                }
              />
            </dl>
            <div className="mt-3 flex flex-col gap-2">
              <SyncButton />
              <Link
                href="/admin/settings"
                className="rounded-xl border border-app-border bg-app-bg px-3 py-2 text-center text-sm font-semibold text-app-text"
              >
                Тохиргоо
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-app-border bg-app-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-app-text">Шинэ бүртгэл</h2>
            {o.latestUsers.length === 0 ? (
              <p className="text-sm text-app-muted">Бүртгэл алга.</p>
            ) : (
              <ul className="divide-y divide-app-divider">
                {o.latestUsers.map((u) => (
                  <li key={u.id}>
                    <Link href={`/admin/users/${u.id}`} className="block py-2">
                      <span className="text-sm text-app-text">@{u.username}</span>
                      <span className="block text-xs text-app-muted">
                        {u.fullName ? `${u.fullName} · ` : ""}
                        {u.createdAt ? ulaanbaatarDateTime(u.createdAt) : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-medium text-app-text">{value}</dd>
    </div>
  );
}
