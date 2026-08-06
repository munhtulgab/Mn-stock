import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";

/**
 * One shell, one shape.
 *
 * The tab bar is the navigation at every width. It began as a phone
 * affordance and a side rail took over from 1024px up, which made a laptop
 * and a phone two different products to learn — and put the alert feed in
 * the rail on one and behind the bell in the header on the other. The bar is
 * the same on both now, and the header carries search and alerts everywhere,
 * so each thing is in one place.
 *
 * The column still widens with the screen: a 448px strip down the middle of
 * a desktop reads as a phone app someone forgot to finish.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");

  return (
    /* dvh rather than vh: on a phone the viewport is the height it is right
       now, not the height it would be with the browser's chrome hidden. */
    <div className="flex min-h-dvh flex-col bg-app-bg">
      {/* The foot of the page clears the tab bar, which takes no space of
          its own now that it is fixed. */}
      <main className="mx-auto w-full max-w-md flex-1 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:max-w-3xl lg:max-w-6xl lg:px-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
