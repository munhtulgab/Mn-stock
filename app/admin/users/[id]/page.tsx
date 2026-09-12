import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { getUserDetail } from "@/lib/adminUsers";
import { ulaanbaatarDateTime } from "@/lib/day";
import Avatar from "@/components/Avatar";
import AdminUserForm from "@/components/admin/AdminUserForm";
import AccountSummary from "@/components/admin/AccountSummary";
import AdminAccountLedger from "@/components/admin/AdminAccountLedger";

export const dynamic = "force-dynamic";

/**
 * One account in full: who they are, what it is worth, and everything they
 * have traded — with each order correctable in place.
 *
 * Two bands. The top one is the account as a record: the details on the left,
 * where they are changed, and the figures on the right, which is what those
 * changes are measured against. The bottom one is the account as a history:
 * the positions and the orders that built them, at equal width, because
 * picking a position filters the orders beside it and neither half is the
 * other's footnote. One column below `lg`, in that order.
 *
 * Positions are valued here, against the same running prices the account
 * holder's own portfolio page uses. The earlier rule was that this page shows
 * shares and average cost and nothing else — that kept a price feed off a
 * page about accounts, at the cost of an administrator who cannot answer what
 * an account is worth without opening the app as somebody else. Sharing one
 * valuation function is what keeps the two pages from disagreeing.
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

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <AdminUserForm user={user} />
        <AccountSummary user={user} />
      </div>

      <AdminAccountLedger user={user} />
    </div>
  );
}
