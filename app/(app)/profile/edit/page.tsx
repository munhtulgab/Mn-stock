import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import AccountForm from "@/components/AccountForm";

export const dynamic = "force-dynamic";

/**
 * A reader's own details: picture, name, phone, e-mail and password.
 *
 * Opened by Засах on Профайл. It was on Тохиргоо, beside the statement
 * import, which made one page of two unrelated jobs; that page is Багц
 * импортлох now and this is the form on its own.
 */
export default async function ProfileEditPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  return (
    <div className="space-y-4 px-4 pt-6 pb-4">
      <Link href="/profile" className="text-sm text-app-muted">
        ← Профайл
      </Link>
      <h1 className="text-xl font-bold text-app-text">Профайл засах</h1>

      <AccountForm
        username={user?.username || ""}
        fullName={user?.fullName || ""}
        email={user?.email || ""}
        phone={user?.phone || ""}
        avatar={user?.avatar || ""}
      />
    </div>
  );
}
