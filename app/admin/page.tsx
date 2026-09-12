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
import OrdersStrip from "@/components/admin/OrdersStrip";
import PeriodPicker from "@/components/admin/PeriodPicker";
import { periodFrom } from "@/lib/adminPeriod";

export const dynamic = "force-dynamic";

/**
 * What the installation looks like from the inside: how many people use it,
 * what they have traded, and whether the machinery behind it is configured.
 *
 * No prices anywhere. An administrator wanting to know what the market did
 * opens the app, which is one link away in the bar.
 */
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const db = await getDb();
  await requireAdminPage(db);
  const days = periodFrom((await searchParams).days);
  const o = await getAdminOverview(db, days);

  /**
   * The change as a share of what was there a week ago.
   *
   * Only when there was something: a count that went from nothing to six is
   * not "+600%", it is six — and printing the first is how a dashboard ends
   * up showing Infinity at somebody on their second day.
   */
  const movement = (total: number, recent: number) => {
    const before = total - recent;
    if (recent === 0) return { delta: undefined, direction: "flat" as const, before };
    if (before <= 0) return { delta: `+${recent}`, direction: "up" as const, before };
    return {
      delta: `${((recent / before) * 100).toFixed(1)}%`,
      direction: "up" as const,
      before,
    };
  };

  const users = movement(o.users.total, o.users.recent);
  const orders = movement(o.orders.total, o.orders.recent);
  const alerts = movement(o.alerts.total, o.alerts.recent);

  return (
    <div className="space-y-4">
      <PageHead title="Хяналтын самбар" sub="Системийн болон хэрэглэгчийн өнөөгийн байдал">
        <PeriodPicker days={o.windowDays} />
        <SyncButton />
      </PageHead>

      {/* One filled card, then three sharing a sheet and told apart by a
          hairline. Four separate cards in a row read as four unrelated
          numbers; this reads as one figure and the context around it. */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <StatCard
          primary
          icon="users"
          label="Хэрэглэгч"
          value={o.users.total.toLocaleString("mn-MN")}
          delta={users.delta}
          direction={users.direction}
          previous={`${o.windowDays} хоногийн өмнө: ${users.before.toLocaleString("mn-MN")}`}
        />

        <div className="grid divide-y divide-app-divider overflow-hidden rounded-2xl border border-app-border bg-app-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCard
            icon="sessions"
            badge="ink"
            label="Нэвтэрсэн сешн"
            value={o.users.sessions.toLocaleString("mn-MN")}
            delta="Идэвхтэй"
            previous="Хугацаа нь дуусаагүй"
          />
          <StatCard
            icon="orders"
            label="Захиалга"
            value={o.orders.total.toLocaleString("mn-MN")}
            delta={orders.delta}
            direction={orders.direction}
            previous={`${o.orders.buys.toLocaleString("mn-MN")} авсан · ${o.orders.sells.toLocaleString("mn-MN")} зарсан`}
          />
          <StatCard
            icon="alerts"
            label="Мэдэгдэл"
            value={o.alerts.total.toLocaleString("mn-MN")}
            delta={alerts.delta}
            direction={alerts.direction}
            previous={
              o.alerts.lastAt
                ? `Сүүлийнх: ${ulaanbaatarDateTime(o.alerts.lastAt)}`
                : "Хараахан алга"
            }
          />
        </div>
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Арилжааны идэвх" note="Сүүлийн 14 хоног">
          <OrdersStrip days={o.daily} />
        </Panel>

        <Panel title="Системийн байдал">
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

          <div className="mt-4 rounded-xl bg-app-elevated p-3.5">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-app-muted">AI түлхүүр</span>
              <span className="font-semibold tabular-nums">
                {o.system.aiKeys} / {o.system.aiKeysPossible}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.round((o.system.aiKeys / o.system.aiKeysPossible) * 100)}%`,
                  background:
                    "linear-gradient(90deg, var(--admin-fill-from), var(--admin-fill-to))",
                }}
              />
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="Сүүлийн захиалгууд"
          note={
            <Link href="/admin/users" className="font-semibold text-brand">
              Хэрэглэгчид →
            </Link>
          }
          flush
        >
          {o.latestOrders.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-app-muted">
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
                        <Link
                          href={`/admin/users/${t.userId}`}
                          className="font-semibold text-app-text"
                        >
                          @{t.username}
                        </Link>
                      </Td>
                      <Td>
                        <span className="font-semibold">{t.symbol}</span>
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
                    className="rowlink flex items-center gap-3 px-5 py-3"
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

        <Panel title="Шинэ бүртгэл" flush>
          {o.latestUsers.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-app-muted">Бүртгэл алга.</p>
          ) : (
            <div className="divide-y divide-app-divider">
              {o.latestUsers.map((u) => (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className="rowlink flex items-baseline justify-between gap-3 px-5 py-3"
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
      </section>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-app-divider px-5 pb-3 text-[11px] font-medium text-app-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-5 py-3 text-[13px] ${right ? "text-right tabular-nums" : "text-left"}`}>
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
    <div className="flex items-center justify-between gap-3 border-b border-app-divider py-2.5 last:border-0">
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
