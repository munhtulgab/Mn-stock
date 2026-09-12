import Link from "next/link";
import StatementImport from "@/components/StatementImport";

export const dynamic = "force-dynamic";

/**
 * What a reader can set about their own account, which is one thing: telling
 * the app what they actually own.
 *
 * The installation's settings used to be on this page too — API keys, the
 * Facebook cookie, the news sources, the SMS sender, the push switch. None of
 * those belong to a reader; they are the operator's, and they are at
 * `/admin/settings` now, behind the role. What is left here is the import,
 * which reads one person's broker statements into one person's portfolio.
 */
export default function SettingsPage() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <Link href="/profile" className="text-sm text-app-muted">
        ← Профайл
      </Link>
      <h1 className="text-xl font-bold text-app-text">Тохиргоо</h1>
      <StatementImport />
    </div>
  );
}
