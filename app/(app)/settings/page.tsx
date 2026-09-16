import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import AccountForm from "@/components/AccountForm";
import StatementImport from "@/components/StatementImport";

export const dynamic = "force-dynamic";

/**
 * What a reader can set about their own account: who they are, and what the
 * app should believe they own.
 *
 * The installation's settings used to be on this page — API keys, the
 * Facebook cookie, the news sources, the SMS sender, the push switch. None of
 * those belong to a reader; they are the operator's, and they are at
 * `/admin/settings` now, behind the role.
 *
 * What was left afterwards was the import and nothing else, which made a page
 * called Тохиргоо with no setting on it and nothing to save. The account form
 * moved here from behind the pencil on Профайл, and the page is what its name
 * says again.
 */
export default async function SettingsPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  return (
    <div className="space-y-4 px-4 pt-6 pb-4">
      <Link href="/profile" className="text-sm text-app-muted">
        ← Профайл
      </Link>
      <h1 className="text-xl font-bold text-app-text">Тохиргоо</h1>

      <AccountForm
        username={user?.username || ""}
        fullName={user?.fullName || ""}
        email={user?.email || ""}
        phone={user?.phone || ""}
        avatar={user?.avatar || ""}
      />

      <StatementImport />
    </div>
  );
}
