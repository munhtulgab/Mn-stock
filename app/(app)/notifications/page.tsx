import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications, getUnreadCount, markAllRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  // Read the unread cutoff before clearing it, so this render can still show
  // which rows were new when the page was opened.
  const unreadBefore = await getUnreadCount(db, user!);
  const items = await getNotifications(db);
  if (unreadBefore > 0) await markAllRead(db, user!._id!);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-app-text">Мэдэгдэл</h1>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
          Одоогоор мэдэгдэл алга. Дохио өөрчлөгдөхөд энд харагдана.
        </div>
      ) : (
        <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
          {items.map((n, i) => {
            const isNew = i < unreadBefore;
            const row = (
              <div className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    isNew ? "bg-brand" : "bg-transparent"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-app-text">{n.title}</div>
                  <div className="text-xs text-app-muted mt-0.5 break-words">{n.body}</div>
                  <div className="text-[11px] text-app-muted mt-1">
                    {new Date(n.createdAt).toLocaleString("mn-MN")}
                  </div>
                </div>
              </div>
            );
            return n.url ? (
              <Link key={i} href={n.url} className="block active:bg-app-elevated">
                {row}
              </Link>
            ) : (
              <div key={i}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
