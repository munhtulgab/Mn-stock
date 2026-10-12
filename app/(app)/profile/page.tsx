import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import ProfileCard from "@/components/ProfileCard";
import NotificationBell from "@/components/NotificationBell";
import InstallPwaButton from "@/components/InstallPwaButton";
import LogoutButton from "@/components/LogoutButton";
import {
  DownloadIcon,
  ChevronRightIcon,
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

  return (
    <div className="space-y-6 px-4 pt-6 pb-4">
      <PageHeader title="Профайл" />

      <div>
        <ProfileCard
          username={user?.username || ""}
          fullName={user?.fullName || ""}
          email={user?.email || ""}
          phone={user?.phone || ""}
          avatar={user?.avatar || ""}
        />

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
        {/* Was Тохиргоо. With the account form moved under Засах above, the
            import was all that page held, so the row names it. */}
        <Link
          href="/profile/import"
          className="flex w-full items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <DownloadIcon /> Багц импортлох
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
