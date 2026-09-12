import type { Metadata } from "next";
import { getDb } from "@/lib/mongodb";
import { isServiceAdmin, requireAdminPage } from "@/lib/roles";
import { countSections } from "@/lib/adminOverview";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Удирдлага · MSE Invest",
  // Nothing here belongs in a search result or a link preview.
  robots: { index: false, follow: false },
};

/**
 * The shell for everything under /admin: one white sheet on a cool grey
 * ground, with the bar across the top of it.
 *
 * Separate from the app's shell rather than a section of it — no tab bar, no
 * market ticker keeping prices warm in the background, no header carrying
 * search and the alert bell. None of those belong on a page about accounts,
 * and the ticker in particular is a poll this side has no use for.
 *
 * The sheet is what makes the section read as an application rather than as a
 * document: the ground around it says where the work stops. `admin-surface`
 * is what makes both of them light in either theme — see the block of the
 * same name in globals.css. It is one class on one element because every
 * colour under it is already a custom property.
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
  const counts = await countSections(db);

  return (
    <div
      className="admin-surface min-h-dvh px-0 py-0 text-app-text sm:px-5 sm:py-5"
      style={{ backgroundColor: "var(--admin-ground)" }}
    >
      <div className="sheet mx-auto w-full max-w-[1320px] overflow-hidden bg-app-bg sm:rounded-[26px]">
        <AdminNav
          username={admin.username}
          serviceAdmin={isServiceAdmin(admin)}
          accountHref={`/admin/users/${admin._id}`}
          counts={counts}
        />
        <main className="px-4 pt-2 pb-10 md:px-6 md:pb-12">{children}</main>
      </div>
    </div>
  );
}
