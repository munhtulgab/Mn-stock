import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getNotificationFeed } from "@/lib/notifications";
import NotificationFeed from "@/components/NotificationFeed";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);

  // Opening this page reads nothing. An alert is read when the reader opens
  // what it is about, which the row itself reports; until then it keeps its
  // dot however many times the list has been looked at.
  //
  // The counts are not taken from here either. They are what the reader is
  // looking at, and the reader changes it — clearing a row, opening one —
  // without the page being rebuilt, so they are worked out where that state
  // lives. See {@link NotificationFeed}.
  const { groups } = await getNotificationFeed(db, user!);

  return <NotificationFeed groups={groups} />;
}
