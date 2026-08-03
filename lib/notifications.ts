import type { Db } from "mongodb";
import type { AppNotification, User } from "@/lib/types";

const KEEP = 200;

/**
 * Records an alert in the in-app feed. The feed is shared by every user —
 * signal changes are market-wide — and read state is tracked per user.
 */
export async function recordNotification(
  db: Db,
  notification: Omit<AppNotification, "_id" | "createdAt">,
): Promise<void> {
  const collection = db.collection<AppNotification>("notifications");
  await collection.insertOne({ ...notification, createdAt: new Date() } as never);

  // Keep the feed bounded; nobody scrolls past a couple hundred alerts.
  const total = await collection.countDocuments();
  if (total > KEEP) {
    const stale = await collection
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: -1 })
      .skip(KEEP)
      .toArray();
    if (stale.length > 0) {
      await collection.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
    }
  }
}

export async function getNotifications(
  db: Db,
  limit = 50,
): Promise<AppNotification[]> {
  return db
    .collection<AppNotification>("notifications")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function getUnreadCount(db: Db, user: User): Promise<number> {
  const since = user.notificationsReadAt;
  return db
    .collection<AppNotification>("notifications")
    .countDocuments(since ? { createdAt: { $gt: since } } : {});
}

export async function markAllRead(db: Db, userId: string): Promise<void> {
  await db
    .collection<User>("users")
    .updateOne({ _id: userId } as never, {
      $set: { notificationsReadAt: new Date() },
    });
}
