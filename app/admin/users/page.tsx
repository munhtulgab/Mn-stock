import Link from "next/link";
import RowLink from "@/components/admin/RowLink";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { listUsers, type AdminUserRow } from "@/lib/adminUsers";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import Avatar from "@/components/Avatar";
import NewUserForm from "@/components/admin/NewUserForm";
import PageHead from "@/components/admin/PageHead";
import FilterBar from "@/components/admin/FilterBar";
import { RANGES, USER_ACTIVITY, USER_ROLES, pick } from "@/lib/adminFilters";

export const dynamic = "force-dynamic";

/**
 * Everyone with an account, oldest first — which puts the installation's own
 * administrator at the top, where the person reading this usually is.
 *
 * A table on a wide screen. These are six facts per account that only mean
 * anything against the same fact on the row above — the balances, the order
 * counts — and stacked into cards they cannot be compared at all. Below `sm`
 * there is no room to line six columns up, so the same rows become a list.
 *
 * The search is a plain GET form rather than a filter in the browser: the
 * list is server-rendered and there is no reason to ship every account to the
 * page so it can hide most of them.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; activity?: string; joined?: string }>;
}) {
  const db = await getDb();
  await requireAdminPage(db);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const role = pick(params.role, USER_ROLES);
  const activity = pick(params.activity, USER_ACTIVITY);
  const joined = pick(params.joined, RANGES);
  const filtered = Boolean(q || role || activity || joined);
  const users = await listUsers(db, { q: q || undefined, role, activity, joined });

  return (
    <div className="space-y-5">
      <PageHead
        title="Хэрэглэгчид"
        sub={
          filtered
            ? `${users.length.toLocaleString("mn-MN")} илэрц`
            : `Нийт ${users.length.toLocaleString("mn-MN")} бүртгэл`
        }
      >
        <NewUserForm />
      </PageHead>

      <FilterBar
        action="/admin/users"
        search={{
          name: "q",
          label: "Хайх",
          placeholder: "Нэр, утас, и-мэйл",
          value: q,
        }}
        selects={[
          { name: "role", label: "Эрх", value: role, options: USER_ROLES },
          {
            name: "activity",
            label: "Арилжаа",
            value: activity,
            options: USER_ACTIVITY,
          },
          {
            name: "joined",
            label: "Бүртгүүлсэн",
            value: joined,
            options: RANGES,
          },
        ]}
      />

      {users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-app-border p-8 text-center text-sm text-app-muted">
          Энэ шүүлтэд тохирох бүртгэл алга.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card">
          <table className="hidden w-full border-collapse sm:table">
            <thead>
              <tr>
                <Th>Хэрэглэгч</Th>
                <Th>Эрх</Th>
                <Th right>Захиалга</Th>
                <Th right>Хувьцаа</Th>
                <Th right>Үлдэгдэл</Th>
                <Th right>Бүртгүүлсэн</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <RowLink
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className="rowlink cursor-pointer border-b border-app-divider last:border-0"
                >
                  <td className="py-3 pr-4 pl-5">
                    {/* Still the real link: the keyboard reaches it, it
                        opens in a new tab, it has an address. The rest of the
                        row is handled by RowLink around it. */}
                    <Link
                      href={`/admin/users/${u.id}`}
                      prefetch={false}
                      className="flex items-center gap-2.5"
                    >
                      <Avatar src={u.avatar ?? ""} name={u.fullName || u.username} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-app-text">
                          @{u.username}
                        </span>
                        <span className="block truncate text-[11px] text-app-muted">
                          {u.fullName || "нэр оруулаагүй"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <RolePill user={u} />
                  </td>
                  <Td>{u.orderCount.toLocaleString("mn-MN")}</Td>
                  <Td>{u.positionCount.toLocaleString("mn-MN")}</Td>
                  <Td>
                    <span className="font-semibold">
                      <Num value={u.cash} digits={0} suffix="₮" />
                    </span>
                  </Td>
                  <Td>
                    <span className="text-app-muted">
                      {u.createdAt ? ulaanbaatarDateTime(u.createdAt) : "—"}
                    </span>
                  </Td>
                </RowLink>
              ))}
            </tbody>
          </table>

          <div className="divide-y divide-app-divider sm:hidden">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                prefetch={false}
                className="rowlink flex items-center gap-3 px-5 py-3"
              >
                <Avatar src={u.avatar ?? ""} name={u.fullName || u.username} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">@{u.username}</span>
                    <RolePill user={u} />
                  </span>
                  <span className="block truncate text-xs text-app-muted">
                    {u.fullName || "нэр оруулаагүй"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">
                    <Num value={u.cash} digits={0} suffix="₮" />
                  </span>
                  <span className="block text-xs text-app-muted">
                    {u.orderCount} захиалга
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

function RolePill({ user }: { user: AdminUserRow }) {
  if (user.role !== "admin") {
    return <span className="text-[11px] text-app-muted">Хэрэглэгч</span>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-brand">
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {user.founder ? "СИСТЕМ" : "АДМИН"}
    </span>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-app-divider px-5 pt-5 pb-3 text-[11px] font-medium text-app-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3 text-right text-[13px] tabular-nums">{children}</td>;
}
