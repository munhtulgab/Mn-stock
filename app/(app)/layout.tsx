import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import BottomNav from "@/components/BottomNav";
import SideNav from "@/components/SideNav";

/**
 * One shell, three shapes.
 *
 * A phone gets the column it always had, with the tab bar under the thumb.
 * A portrait iPad keeps that bar — it is still a held device — but the
 * column widens, because a 448px strip down the middle of a 768px screen
 * reads as a phone app someone forgot to finish. From 1024px up, which is a
 * landscape iPad or any laptop, navigation moves to a side rail and the
 * content takes the width it is given.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");

  const unread = await getUnreadCount(db, user);

  return (
    /* dvh rather than vh: on a phone the viewport is the height it is right
       now, not the height it would be with the browser's chrome hidden. */
    <div className="min-h-dvh bg-app-bg lg:flex">
      <SideNav unread={unread} />
      <div className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
        {/* The foot of the page clears the tab bar, which no longer takes
            space of its own now that it is fixed. */}
        <main className="mx-auto w-full max-w-md flex-1 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:max-w-3xl lg:max-w-6xl lg:px-6 lg:pb-4">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
