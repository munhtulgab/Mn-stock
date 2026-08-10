import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";
import InstallPwaButton from "@/components/InstallPwaButton";
import LogoutButton from "@/components/LogoutButton";
import { PhoneIcon, MailIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default async function ProfilePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const displayName = user?.fullName || user?.username || "";

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-xl font-bold text-app-text">Профайл</h1>

      <div className="rounded-3xl bg-app-card border border-app-border p-5 flex items-center gap-4">
        <div className="flex items-center justify-center rounded-full bg-brand text-white font-bold w-14 h-14 text-lg shrink-0">
          {initials(displayName)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-app-text truncate">{displayName}</div>
          <div className="text-sm text-app-muted truncate">@{user?.username}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-sm text-app-muted">
            <PhoneIcon /> Утасны дугаар
          </span>
          <span className="text-sm font-medium text-app-text">{user?.phone || "—"}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-sm text-app-muted">
            <MailIcon /> И-мэйл
          </span>
          <span className="text-sm font-medium text-app-text">{user?.email || "—"}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
        <NotificationBell />
        <InstallPwaButton />
        <Link
          href="/settings"
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <span className="text-lg">⚙️</span> Тохиргоо
          </span>
          <span className="text-app-muted">›</span>
        </Link>
      </div>

      <LogoutButton />
    </div>
  );
}
