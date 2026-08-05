import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";
import InstallPwaButton from "@/components/InstallPwaButton";
import LogoutButton from "@/components/LogoutButton";
import ProfileForm from "@/components/ProfileForm";
import { GearIcon, ChevronRightIcon, ReceiptIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-xl font-bold text-app-text">Профайл</h1>

      <ProfileForm
        username={user?.username || ""}
        fullName={user?.fullName || ""}
        email={user?.email || ""}
        phone={user?.phone || ""}
      />

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
        <NotificationBell />
        <InstallPwaButton />
        <Link
          href="/settings"
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <GearIcon /> Тохиргоо
          </span>
          <span className="text-app-muted">
            <ChevronRightIcon />
          </span>
        </Link>
        <Link
          href="/orders"
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <ReceiptIcon /> Захиалгын түүх
          </span>
          <span className="text-app-muted">
            <ChevronRightIcon />
          </span>
        </Link>
      </div>

      <LogoutButton />
    </div>
  );
}
