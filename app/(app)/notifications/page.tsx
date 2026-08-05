import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getNotificationFeed, markAllRead } from "@/lib/notifications";
import NotificationList from "@/components/NotificationList";
import { BellIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  // Built before the cutoff is cleared, so this render can still mark which
  // rows were new when the page was opened.
  const { groups, unread, total } = await getNotificationFeed(db, user!);
  if (unread > 0) await markAllRead(db, user!._id!);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-app-text">Мэдэгдэл</h1>
        <p className="text-xs text-app-muted mt-0.5">
          {unread > 0
            ? `${unread} шинэ · нийт ${total}`
            : total > 0
              ? `${total} мэдэгдэл`
              : "Дохио өөрчлөгдөхөд энд харагдана"}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-app-border p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-app-elevated text-app-muted flex items-center justify-center">
            <BellIcon />
          </div>
          <p className="text-sm text-app-muted">
            Одоогоор мэдэгдэл алга.
            <br />
            Хувьцааны дохио өөрчлөгдөхөд энд харагдана.
          </p>
          <Link href="/discover" className="inline-block text-sm text-brand font-semibold">
            Зах зээл харах
          </Link>
        </div>
      ) : (
        <div className="space-y-5 lg:space-y-0 lg:columns-2 lg:gap-5">
        {groups.map((group) => (
          <section key={group.day} className="lg:mb-5 lg:break-inside-avoid">
            <h2 className="text-xs font-semibold text-app-muted mb-2">
              {group.heading}
            </h2>
            <NotificationList items={group.items} />
          </section>
        ))}
        </div>
      )}
    </div>
  );
}
