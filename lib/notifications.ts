import type { Db } from "mongodb";
import { dayHeading, todayAndYesterday, ulaanbaatarDay, ulaanbaatarTime } from "@/lib/day";
import type { AppNotification, User } from "@/lib/types";

/**
 * How many alerts the feed keeps. Everything older is trimmed away on the
 * next write, so this is also the most the page can ever have to show.
 */
const KEEP = 200;

/**
 * A count per day, kept because the feed above is not a count of anything.
 *
 * The trim is the point of the feed and the ruin of counting from it: once
 * two hundred alerts have been sent, `countDocuments` answers two hundred
 * for ever. The admin dashboard was reading exactly that and showing a
 * "Мэдэгдэл" figure frozen at the cap, with a change beside it computed from
 * two numbers that could no longer move.
 *
 * So the tally is written alongside and never trimmed. One small document
 * per day — a year of them is 365 rows — which also gives the dashboard a
 * real day-by-day series to draw instead of one derived from whatever
 * survived the cull.
 */
const DAILY = "notificationDaily";

interface DailyTally {
  /** `YYYY-MM-DD` in Ulaanbaatar, so a day means the day it was read on. */
  day: string;
  n: number;
}

/**
 * Adds the batch to the day tallies, newest day first in the batch's own
 * order, in one round trip.
 */
async function tally(db: Db, days: string[]): Promise<void> {
  const perDay = new Map<string, number>();
  for (const day of days) perDay.set(day, (perDay.get(day) ?? 0) + 1);

  await db.collection<DailyTally>(DAILY).bulkWrite(
    [...perDay].map(([day, n]) => ({
      updateOne: { filter: { day }, update: { $inc: { n } }, upsert: true },
    })),
  );
}

/**
 * Counts the alerts still in the feed into the tally, once.
 *
 * For installations that were already running before the tally existed. Runs
 * before the batch it precedes is written, so it counts only what was there
 * already. What is left in the feed is all the history there is to recover — anything
 * trimmed before this ran is gone and was never counted anywhere — so this
 * restores the count to at least what the old page was showing rather than
 * starting it from zero, which would have read as every alert disappearing.
 */
async function backfill(db: Db): Promise<void> {
  const tallies = db.collection<DailyTally>(DAILY);
  if ((await tallies.estimatedDocumentCount()) > 0) return;

  const rows = await db
    .collection<AppNotification>("notifications")
    .find({}, { projection: { createdAt: 1 } })
    .toArray();
  if (rows.length === 0) return;
  await tally(db, rows.map((r) => ulaanbaatarDay(new Date(r.createdAt))));
}

/** Every day's count, oldest first. Never trimmed, so this is the real total. */
export async function notificationTally(
  db: Db,
): Promise<{ day: string; n: number }[]> {
  const rows = await db
    .collection<DailyTally>(DAILY)
    .find({}, { projection: { _id: 0, day: 1, n: 1 } })
    .toArray();
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

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

  // Before the insert, not after. The backfill counts what is in the feed,
  // and rows written a line earlier are in the feed — so running it second
  // counted this batch twice, once as history and once as itself.
  await backfill(db);

  const base = Date.now() - (notifications.length - 1);
  const stamped = notifications.map((n, i) => ({
    ...n,
    createdAt: new Date(base + i),
  }));
  await collection.insertMany(stamped as never);
  await tally(db, stamped.map((n) => ulaanbaatarDay(n.createdAt)));

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

/**
 * The alerts the feed holds, newest first.
 *
 * All of them: the limit is the size of the feed rather than a page of it.
 * It used to be fifty, which was a page's worth and not a stated one — the
 * feed keeps four times that, the page has no "show more", and the unread
 * count is taken from the same list. A reader with fifty unread alerts saw
 * the count stick at fifty, and the hundred and fifty behind them were
 * unreachable: still stored, never shown.
 */
async function getNotifications(db: Db): Promise<AppNotification[]> {
  return db
    .collection<AppNotification>("notifications")
    .find({})
    .sort({ createdAt: -1 })
    .limit(KEEP)
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
