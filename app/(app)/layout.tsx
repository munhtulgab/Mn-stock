import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      <div className="flex-1 mx-auto w-full max-w-md pb-4">{children}</div>
      <BottomNav />
    </div>
  );
}
