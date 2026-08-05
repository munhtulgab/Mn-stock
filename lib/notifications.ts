import type { Db } from "mongodb";
import { dayHeading, todayAndYesterday, ulaanbaatarDay, ulaanbaatarTime } from "@/lib/day";
import type { AppNotification, User } from "@/lib/types";

const KEEP = 200;

/**
 * Records an alert in the in-app feed. The feed is shared by every user —
 * signal changes are market-wide — and read state is tracked per user.
 */
export async function recordNotification(
  db: Db,
  notification: NewNotification,
): Promise<void> {
  await recordNotifications(db, [notification]);
}

type NewNotification = Omit<AppNotification, "_id" | "createdAt">;

/**
 * Records a batch as one write. A sync that flips a dozen signals writes a
 * row per company — each one links to that company — and doing them one at a
 * time would re-count and re-trim the feed a dozen times over.
 *
 * Timestamps are spaced a millisecond apart, newest last, so the feed's sort
 * has something to order them by instead of leaving a batch's rows tied.
 */
export async function recordNotifications(
  db: Db,
  notifications: NewNotification[],
): Promise<void> {
  if (notifications.length === 0) return;

  const collection = db.collection<AppNotification>("notifications");
  const base = Date.now() - (notifications.length - 1);
  await collection.insertMany(
    notifications.map((n, i) => ({ ...n, createdAt: new Date(base + i) })) as never,
  );

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

export interface FeedNotification
  extends Omit<AppNotification, "_id" | "createdAt"> {
  /** `HH:MM` in Ulaanbaatar. */
  time: string;
  /** Arrived since this reader last opened the page. */
  isNew: boolean;
}

export interface NotificationFeed {
  groups: { day: string; heading: string; items: FeedNotification[] }[];
  unread: number;
  total: number;
}

/**
 * The feed as the page shows it: newest first, split into days.
 *
 * Grouping and the unread cutoff both need the current time, and a component
 * that reads the clock while rendering is not idempotent — so the reading
 * happens here, once, and the page renders what it is handed.
 *
 * Unread is decided by comparing timestamps rather than counting rows off the
 * top: a sync writes a whole batch at once, and position in the list is not a
 * reliable stand-in for "newer than your last visit".
 */
export async function getNotificationFeed(
  db: Db,
  user: User,
): Promise<NotificationFeed> {
  const [items, unread] = await Promise.all([
    getNotifications(db),
    getUnreadCount(db, user),
  ]);
  const { today, yesterday } = todayAndYesterday();
  const readAt = user.notificationsReadAt;

  const groups: NotificationFeed["groups"] = [];
  for (const n of items) {
    const createdAt = new Date(n.createdAt);
    const day = ulaanbaatarDay(createdAt);
    if (groups.at(-1)?.day !== day) {
      groups.push({ day, heading: dayHeading(day, today, yesterday), items: [] });
    }
    groups.at(-1)!.items.push({
      title: n.title,
      body: n.body,
      url: n.url,
      kind: n.kind,
      symbol: n.symbol,
      signal: n.signal,
      previousSignal: n.previousSignal,
      time: ulaanbaatarTime(createdAt),
      isNew: !readAt || createdAt > readAt,
    });
  }

  return { groups, unread, total: items.length };
}

export async function markAllRead(db: Db, userId: string): Promise<void> {
  await db
    .collection<User>("users")
    .updateOne({ _id: userId } as never, {
      $set: { notificationsReadAt: new Date() },
    });
}
