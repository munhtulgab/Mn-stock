import type { Metadata } from "next";
import { getDb } from "@/lib/mongodb";
import { isServiceAdmin, requireAdminPage } from "@/lib/roles";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Удирдлага · MSE Invest",
  // Nothing here belongs in a search result or a link preview.
  robots: { index: false, follow: false },
};

/**
 * The shell for everything under /admin.
 *
 * A separate shell rather than a section of the app's: no tab bar, no market
 * ticker keeping prices warm in the background, no header carrying search and
 * the alert bell. None of those belong on a page about accounts, and the
 * ticker in particular is a poll this side of the app has no use for.
 *
 * The check here is for the shell it draws. Each page checks again — a layout
 * is not re-rendered when the reader moves between two routes it covers, so a
 * check made only here is made once per visit and trusted thereafter.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await getDb();
  const admin = await requireAdminPage(db);

  return (
    <div className="flex min-h-dvh flex-col bg-app-bg">
      <AdminNav
        username={admin.username}
        serviceAdmin={isServiceAdmin(admin)}
        accountHref={`/admin/users/${admin._id}`}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-16">{children}</main>
    </div>
  );
}
