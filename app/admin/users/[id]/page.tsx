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

export const dynamic = "force-dynamic";

/**
 * One account in full: who they are, what the account holds, and everything
 * they have traded — with each order correctable in place.
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
      <Link href="/admin/users" className="text-sm text-app-muted">
        ← Хэрэглэгчид
      </Link>

      <div className="flex items-center gap-3">
        <Avatar src={user.avatar ?? ""} name={user.fullName || user.username} size={48} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-app-text">
            @{user.username}
            {user.role === "admin" && (
              <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-brand">
                АДМИН
              </span>
            )}
          </h1>
          <p className="truncate text-sm text-app-muted">
            {user.founder ? "үүсгэн байгуулагч · " : ""}
            {user.fullName || "нэр оруулаагүй"}
            {user.createdAt ? ` · бүртгүүлсэн ${ulaanbaatarDateTime(user.createdAt)}` : ""}
            {` · ${user.sessions} нэвтэрсэн сешн`}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-app-text">Бүртгэлийн мэдээлэл</h2>
        <AdminUserForm user={user} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-app-text">
          Байрлал <span className="font-normal text-app-muted">({user.holdings.length})</span>
        </h2>
        {user.holdings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
            Хувьцаа эзэмшээгүй байна.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider">
            {user.holdings.map((h) => (
              <div key={h.companyCode} className="flex items-center gap-3 px-4 py-3">
                <StockAvatar symbol={h.symbol} size={32} />
                <span className="flex-1 text-sm font-semibold text-app-text">{h.symbol}</span>
                <span className="text-right">
                  <span className="block text-sm text-app-text">{h.quantity} ш</span>
                  <span className="block text-xs text-app-muted">
                    дундаж өртөг <Num value={h.avgCost} digits={2} suffix="₮" />
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-app-text">
          Захиалгын түүх{" "}
          <span className="font-normal text-app-muted">({user.orders.length})</span>
        </h2>
        <p className="text-xs text-app-muted">
          Засах, буцаах, устгах бүр мөнгөн үлдэгдэл болон хувьцааны байрлалыг зөрүүгээр нь
          хамт хөдөлгөнө.
        </p>
        <AdminOrderRows userId={user.id} orders={user.orders} />
      </section>
    </div>
  );
}
