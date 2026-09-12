import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { listUsers } from "@/lib/adminUsers";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import Avatar from "@/components/Avatar";
import NewUserForm from "@/components/admin/NewUserForm";
import { SearchIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Everyone with an account, oldest first — which puts the installation's own
 * administrator at the top, where the person reading this usually is.
 *
 * The search is a plain GET form rather than a filter in the browser: the list
 * is server-rendered and there is no reason to ship every account to the page
 * so it can hide most of them.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const db = await getDb();
  await requireAdminPage(db);
  const { q } = await searchParams;
  const users = await listUsers(db, q?.trim() || undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-text">Хэрэглэгчид</h1>
          <p className="text-sm text-app-muted">
            {q ? `"${q}" — ${users.length} илэрц` : `Нийт ${users.length}`}
          </p>
        </div>
        <NewUserForm />
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted">
            <SearchIcon size={16} />
          </span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Нэр, утас, и-мэйлээр хайх"
            className="w-full rounded-xl border border-app-border bg-app-card py-2 pl-9 pr-3 text-sm text-app-text placeholder:text-app-muted"
          />
        </div>
        <button className="rounded-xl border border-app-border bg-app-card px-4 py-2 text-sm font-semibold text-app-text">
          Хайх
        </button>
      </form>

      {users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
          Илэрц олдсонгүй.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card">
          {/* One row per account at every width: the table it wants to be does
              not survive a phone, and this page is opened on one. */}
          <div className="divide-y divide-app-divider">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Avatar src={u.avatar ?? ""} name={u.fullName || u.username} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-app-text">
                      @{u.username}
                    </span>
                    {u.role === "admin" && (
                      <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-brand">
                        АДМИН
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-app-muted">
                    {u.founder ? "үүсгэн байгуулагч · " : ""}
                    {u.fullName || "нэр оруулаагүй"}
                    {u.createdAt ? ` · ${ulaanbaatarDateTime(u.createdAt)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm text-app-text">
                    <Num value={u.cash} digits={0} suffix="₮" />
                  </span>
                  <span className="block text-xs text-app-muted">
                    {u.orderCount} захиалга · {u.positionCount} байрлал
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
