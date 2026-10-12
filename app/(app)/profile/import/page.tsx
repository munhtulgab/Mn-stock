import Link from "next/link";
import StatementImport from "@/components/StatementImport";

/**
 * Rendered per request, like every page under the app's layout. Nothing on
 * the page itself reads a request, so without this the build tried to
 * prerender it — and the layout around it reads the signed-in reader from
 * the database, which a build has no business doing.
 */
export const dynamic = "force-dynamic";

/**
 * Loading a broker statement into this account's portfolio.
 *
 * This was Тохиргоо, which by the end held two unrelated things: the account
 * form and the import. The form went to Профайл → Засах, where a reader
 * looks to change their name or picture, and what was left is the import —
 * so the page is called what it does, and the row that opens it on Профайл
 * says the same. `/settings` still arrives here; see `next.config.ts`.
 */
export default function ImportPage() {
  return (
    <div className="space-y-4 px-4 pt-6 pb-4">
      <Link href="/profile" className="text-sm text-app-muted">
        ← Профайл
      </Link>
      <h1 className="text-xl font-bold text-app-text">Багц импортлох</h1>
      <StatementImport />
    </div>
  );
}
