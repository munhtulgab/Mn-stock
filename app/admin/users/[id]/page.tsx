import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { getUserDetail } from "@/lib/adminUsers";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import Avatar from "@/components/Avatar";
import StockAvatar from "@/components/StockAvatar";
import AdminUserForm from "@/components/admin/AdminUserForm";
import AdminOrderRows from "@/components/admin/AdminOrderRows";
import Panel from "@/components/admin/Panel";

export const dynamic = "force-dynamic";

/**
 * One account in full: who they are, what the account holds, and everything
 * they have traded — with each order correctable in place.
 *
 * Two columns where there is room. The left is what gets changed — the
 * details, then the order history the corrections act on; the right is what
 * is being changed, the balances and holdings, which stay in view while the
 * left is worked on. One column below `lg`, in that order.
 *
 * A position is shown as a number of shares and what was paid for them, and
 * not as what it is worth today. The app values a portfolio against the
 * running market; doing that here would put a price feed on a page about
 * accounts, and would make an administrator's figure disagree with the
 * reader's own the moment either page was left open.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = await getDb();
  await requireAdminPage(db);
  const { id } = await params;
  const user = await getUserDetail(db, id);
  if (!user) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-app-muted"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 6l-6 6 6 6" />
        </svg>
        Хэрэглэгчид
      </Link>

      <div className="flex items-center gap-3.5">
        <Avatar src={user.avatar ?? ""} name={user.fullName || user.username} size={52} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em] text-app-text">
            @{user.username}
            {user.role === "admin" && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-brand">
                <span className="h-[5px] w-[5px] rounded-full bg-current" />
                {user.founder ? "СИСТЕМИЙН АДМИН" : "АДМИН"}
              </span>
            )}
          </h1>
          <p className="truncate text-sm text-app-muted">
            {user.fullName || "нэр оруулаагүй"}
            {user.createdAt ? ` · бүртгүүлсэн ${ulaanbaatarDateTime(user.createdAt)}` : ""}
            {` · ${user.sessions} нэвтэрсэн сешн`}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <AdminUserForm user={user} />

          <Panel
            title="Захиалгын түүх"
            note={`${user.orders.length} бичлэг`}
            flush
          >
            <p className="px-5 pb-4 text-[13px] text-app-muted">
              Засах, буцаах, устгах бүр мөнгөн үлдэгдэл болон хувьцааны тоог зөрүүгээр нь
              хамт хөдөлгөнө.
            </p>
            <AdminOrderRows userId={user.id} orders={user.orders} />
          </Panel>
        </div>

        <div className="grid gap-3">
          <Panel title="Дансны хураангуй">
            <dl className="text-sm">
              <Row label="Мөнгөн үлдэгдэл">
                <Num value={user.cash} digits={0} suffix="₮" />
              </Row>
              <Row label="Захиалга">{user.orderCount.toLocaleString("mn-MN")}</Row>
              <Row label="Хувьцаа">{user.positionCount.toLocaleString("mn-MN")}</Row>
              <Row label="Нэвтэрсэн сешн">{user.sessions.toLocaleString("mn-MN")}</Row>
            </dl>
          </Panel>

          <Panel
            title="Эзэмшиж буй хувьцаа"
            note={`${user.holdings.length}`}
            flush
          >
            {user.holdings.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-app-muted">
                Хувьцаа эзэмшээгүй байна.
              </p>
            ) : (
              <div className="divide-y divide-app-divider">
                {user.holdings.map((h) => (
                  <div key={h.companyCode} className="flex items-center gap-3 px-5 py-3">
                    <StockAvatar symbol={h.symbol} size={32} />
                    <span className="flex-1 text-sm font-semibold">{h.symbol}</span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {h.quantity.toLocaleString("mn-MN")} ш
                      </span>
                      <span className="block text-[11px] text-app-muted">
                        дундаж өртөг <Num value={h.avgCost} digits={2} suffix="₮" />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
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
