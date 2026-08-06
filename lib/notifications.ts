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
      const ids = stale.map((d) => d._id);
      await collection.deleteMany({ _id: { $in: ids } });
      // Readers keep the ids they have opened and dismissed. An id whose
      // alert no longer exists is a name for nothing, and left alone the two
      // lists would grow for as long as the account did.
      const gone = ids.map(String);
      await db.collection<User>("users").updateMany({}, {
        $pull: {
          notificationsRead: { $in: gone },
          notificationsDismissed: { $in: gone },
        },
      } as never);
    }
  }
}

async function getNotifications(
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

/**
 * Whether this reader has read a given alert.
 *
 * Opening the page is not reading it: an alert is read when the reader opens
 * the thing it is about. The legacy cutoff is still honoured as a floor so
 * alerts cleared under the old rule stay cleared.
 */
function isRead(user: User, id: string, createdAt: Date): boolean {
  if (user.notificationsRead?.includes(id)) return true;
  return !!user.notificationsReadAt && createdAt <= user.notificationsReadAt;
}

function isDismissed(user: User, id: string): boolean {
  return !!user.notificationsDismissed?.includes(id);
}

export async function getUnreadCount(db: Db, user: User): Promise<number> {
  const items = await getNotifications(db);
  return items.filter(
    (n) =>
      !isDismissed(user, String(n._id)) &&
      !isRead(user, String(n._id), new Date(n.createdAt)),
  ).length;
}

export interface FeedNotification
  extends Omit<AppNotification, "_id" | "createdAt"> {
  /** The alert's own id, for marking it read and for swiping it away. */
  id: string;
  /** `HH:MM` in Ulaanbaatar. */
  time: string;
  /** Not yet opened by this reader. */
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
 * Grouping needs the current time, and a component that reads the clock while
 * rendering is not idempotent — so the reading happens here, once, and the
 * page renders what it is handed.
 */
export async function getNotificationFeed(
  db: Db,
  user: User,
): Promise<NotificationFeed> {
  const items = (await getNotifications(db)).filter(
    (n) => !isDismissed(user, String(n._id)),
  );
  const { today, yesterday } = todayAndYesterday();

  const groups: NotificationFeed["groups"] = [];
  let unread = 0;
  for (const n of items) {
    const createdAt = new Date(n.createdAt);
    const day = ulaanbaatarDay(createdAt);
    if (groups.at(-1)?.day !== day) {
      groups.push({ day, heading: dayHeading(day, today, yesterday), items: [] });
    }
    const isNew = !isRead(user, String(n._id), createdAt);
    if (isNew) unread++;
    groups.at(-1)!.items.push({
      id: String(n._id),
      title: n.title,
      body: n.body,
      url: n.url,
      kind: n.kind,
      symbol: n.symbol,
      signal: n.signal,
      previousSignal: n.previousSignal,
      time: ulaanbaatarTime(createdAt),
      isNew,
    });
  }

  return { groups, unread, total: items.length };
}

/** The reader opened this alert, so it is read. */
export async function markRead(db: Db, userId: string, id: string): Promise<void> {
  await db
    .collection<User>("users")
    .updateOne({ _id: userId } as never, {
      $addToSet: { notificationsRead: id },
    } as never);
}

/** The reader swiped this alert away, so it is gone from their feed. */
export async function dismiss(db: Db, userId: string, id: string): Promise<void> {
  await db
    .collection<User>("users")
    .updateOne({ _id: userId } as never, {
      $addToSet: { notificationsDismissed: id },
    } as never);
}
