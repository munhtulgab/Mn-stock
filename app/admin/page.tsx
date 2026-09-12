import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { getAdminOverview } from "@/lib/adminOverview";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import StatCard from "@/components/admin/StatCard";
import SyncButton from "@/components/admin/SyncButton";
import PageHead from "@/components/admin/PageHead";
import Panel from "@/components/admin/Panel";

export const dynamic = "force-dynamic";

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

/**
 * What the installation looks like from the inside: how many people use it,
 * what they have traded, and whether the machinery behind it is configured.
 *
 * No prices anywhere. An administrator wanting to know what the market did
 * opens the app, which is one link away in the rail.
 */
export default async function AdminOverviewPage() {
  const db = await getDb();
  await requireAdminPage(db);
  const o = await getAdminOverview(db);

  return (
    <div className="space-y-5">
      <PageHead
        title="Хяналтын самбар"
        sub="Системийн болон хэрэглэгчийн ерөнхий байдал"
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Хэрэглэгч"
          value={o.users.total.toLocaleString("mn-MN")}
          delta={o.users.recent > 0 ? `+${o.users.recent}` : undefined}
          hint={o.users.recent > 0 ? "сүүлийн 7 хоногт" : "шинэ бүртгэл алга"}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24">
              <circle cx="9.5" cy="8" r="3.3" {...STROKE} />
              <path d="M3.5 19.5c1-3.4 3.4-5 6-5s5 1.6 6 5" {...STROKE} />
              <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2" {...STROKE} />
            </svg>
          }
        />
        <StatCard
          label="Нэвтэрсэн сешн"
          value={o.users.sessions.toLocaleString("mn-MN")}
          delta="Идэвхтэй"
          deltaTone="flat"
          hint="хугацаа дуусаагүй"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M12 3.5v8.7" {...STROKE} />
              <path d="M7.5 6.4a7.5 7.5 0 1 0 9 0" {...STROKE} />
            </svg>
          }
        />
        <StatCard
          label="Захиалга"
          value={o.orders.total.toLocaleString("mn-MN")}
          delta={o.orders.recent > 0 ? `+${o.orders.recent}` : undefined}
          hint={`${o.orders.buys} авсан · ${o.orders.sells} зарсан`}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M5 4.5h14v15l-3.5-2-3.5 2-3.5-2L5 19.5z" {...STROKE} />
              <path d="M8.5 9h7M8.5 13h4" {...STROKE} />
            </svg>
          }
        />
        <StatCard
          label="Мэдэгдэл"
          value={o.alerts.total.toLocaleString("mn-MN")}
          delta={o.alerts.recent > 0 ? `+${o.alerts.recent} · 7 хоногт` : undefined}
          hint={
            o.alerts.lastAt
              ? `сүүлийнх ${ulaanbaatarDateTime(o.alerts.lastAt)}`
              : "хараахан алга"
          }
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" {...STROKE} />
              <path d="M13.7 19.5a2 2 0 0 1-3.4 0" {...STROKE} />
            </svg>
          }
        />
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Идэвх"
          title="Сүүлийн захиалгууд"
          note={
            <Link href="/admin/users" className="font-semibold text-brand">
              Хэрэглэгчид →
            </Link>
          }
          flush
        >
          {o.latestOrders.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-app-muted">
              Хараахан арилжаа хийгдээгүй байна.
            </p>
          ) : (
            <>
              {/* A table where there is room for columns to line up, and a
                  list of rows where there is not. The same six facts. */}
              <table className="hidden w-full border-collapse sm:table">
                <thead>
                  <tr>
                    <Th>Хэрэглэгч</Th>
                    <Th>Хувьцаа</Th>
                    <Th>Төрөл</Th>
                    <Th right>Тоо</Th>
                    <Th right>Дүн</Th>
                    <Th right>Цаг</Th>
                  </tr>
                </thead>
                <tbody>
                  {o.latestOrders.map((t) => (
                    <tr key={t.id} className="rowlink border-b border-app-divider last:border-0">
                      <Td>
                        <Link href={`/admin/users/${t.userId}`} className="block">
                          <span className="text-[13px] font-semibold text-app-text">
                            @{t.username}
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        <span className="text-[13px] font-semibold">{t.symbol}</span>
                      </Td>
                      <Td>
                        <SidePill side={t.side} />
                      </Td>
                      <Td right>{t.quantity.toLocaleString("mn-MN")}</Td>
                      <Td right>
                        <span className="font-semibold">
                          <Num value={t.total} digits={0} suffix="₮" />
                        </span>
                      </Td>
                      <Td right>
                        <span className="text-app-muted">
                          {ulaanbaatarDateTime(t.createdAt)}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="divide-y divide-app-divider sm:hidden">
                {o.latestOrders.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/users/${t.userId}`}
                    className="rowlink flex items-center gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{t.symbol}</span>
                        <SidePill side={t.side} />
                      </span>
                      <span className="block truncate text-xs text-app-muted">
                        @{t.username} · {ulaanbaatarDateTime(t.createdAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold">
                        <Num value={t.total} digits={0} suffix="₮" />
                      </span>
                      <span className="block text-xs text-app-muted">{t.quantity} ш</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="grid gap-3">
          <Panel eyebrow="Байдал" title="Систем">
            <dl className="text-sm">
              <Row label="Сүүлийн синк">
                {o.system.lastSecuritiesSyncAt
                  ? ulaanbaatarDateTime(o.system.lastSecuritiesSyncAt)
                  : "—"}
              </Row>
              <Row label="Мэдээллийн эх сурвалж">{o.system.newsSources}</Row>
              <Row label="Push мэдэгдэл">
                <State on={o.system.pushEnabled} />
              </Row>
              <Row label="SMS">
                <State on={o.system.smsEnabled} />
              </Row>
            </dl>

            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[11px] text-app-muted">
                <span>AI түлхүүр</span>
                <span className="tabular-nums">
                  {o.system.aiKeys} / {o.system.aiKeysPossible}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-app-elevated">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{
                    width: `${Math.round((o.system.aiKeys / o.system.aiKeysPossible) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <SyncButton />
              <Link
                href="/admin/settings"
                className="flex flex-1 items-center justify-center rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm font-semibold text-app-text"
              >
                Тохиргоо
              </Link>
            </div>
          </Panel>

          <Panel eyebrow="Шинэ" title="Бүртгэл" flush>
            {o.latestUsers.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-app-muted">Бүртгэл алга.</p>
            ) : (
              <div className="divide-y divide-app-divider">
                {o.latestUsers.map((u) => (
                  <Link
                    key={u.id}
                    href={`/admin/users/${u.id}`}
                    className="rowlink flex items-baseline justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">
                        @{u.username}
                      </span>
                      <span className="block truncate text-[11px] text-app-muted">
                        {u.fullName || "нэр оруулаагүй"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-app-muted">
                      {u.createdAt ? ulaanbaatarDateTime(u.createdAt) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-app-divider px-4 pb-2.5 text-[10px] font-semibold tracking-[0.09em] text-app-muted uppercase ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td
      className={`px-4 py-2.5 text-[13px] ${right ? "text-right tabular-nums" : "text-left"}`}
    >
      {children}
    </td>
  );
}

function SidePill({ side }: { side: "BUY" | "SELL" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        side === "BUY"
          ? "bg-app-positive-bg text-app-positive"
          : "bg-app-negative-bg text-app-negative"
      }`}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {side === "BUY" ? "АВСАН" : "ЗАРСАН"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-app-divider py-2 first:border-0 first:pt-0">
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function State({ on }: { on: boolean }) {
  return (
    <span className={on ? "text-app-positive" : "text-app-muted"}>
      {on ? "Идэвхтэй" : "Унтраалттай"}
    </span>
  );
}
