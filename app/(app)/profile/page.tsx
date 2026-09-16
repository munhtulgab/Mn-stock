import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import Avatar from "@/components/Avatar";
import NotificationBell from "@/components/NotificationBell";
import InstallPwaButton from "@/components/InstallPwaButton";
import LogoutButton from "@/components/LogoutButton";
import {
  GearIcon,
  ChevronRightIcon,
  EditIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
} from "@/components/icons";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const admin = await isAdmin(db, user);
  const displayName = user?.fullName || user?.username || "";

  return (
    <div className="space-y-6 px-4 pt-6 pb-4">
      <PageHeader title="Профайл" />

      <div>
        <div className="flex items-center gap-4 rounded-3xl border border-app-border bg-app-card p-5">
          <Avatar src={user?.avatar || ""} name={displayName} size={56} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-app-text">{displayName}</div>
            <div className="truncate text-sm text-app-muted">@{user?.username}</div>
          </div>
          {/* A word, not a disc. This was a bare pencil with nothing but an
              aria-label on it, and it was the only way to the one Хадгалах
              button on this side of the app — so a reader who came here to
              change their details found a page of text with nothing on it to
              press. It says what it does now, and what it opens is a page
              that is a form from the top. */}
          <Link
            href="/settings"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-2 text-sm font-semibold text-app-text transition-transform active:scale-95"
          >
            <EditIcon /> Засах
          </Link>
        </div>

        <div className="mt-6 divide-y divide-app-divider overflow-hidden rounded-2xl border border-app-border bg-app-card">
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-app-muted">
              <PhoneIcon /> Утасны дугаар
            </span>
            <span className="text-sm font-medium text-app-text">
              {user?.phone || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-sm text-app-muted">
              <MailIcon /> И-мэйл
            </span>
            <span className="text-sm font-medium text-app-text">
              {user?.email || "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-app-divider overflow-hidden rounded-2xl border border-app-border bg-app-card">
        <NotificationBell />
        <InstallPwaButton />
        <Link
          href="/settings"
          className="flex w-full items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <GearIcon /> Тохиргоо
          </span>
          <span className="text-app-muted">
            <ChevronRightIcon />
          </span>
        </Link>
        {/* Only for the people it would work for. A row that turns anyone else
            away the moment they tap it is worse than no row. */}
        {admin && (
          <Link
            href="/admin"
            className="flex w-full items-center justify-between px-4 py-3.5"
          >
            <span className="flex items-center gap-3 text-sm text-app-text">
              <LockIcon /> Удирдлага
            </span>
            <span className="text-app-muted">
              <ChevronRightIcon />
            </span>
          </Link>
        )}
      </div>

      <LogoutButton />
    </div>
  );
}
