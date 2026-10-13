import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { Db } from "mongodb";
import webpush from "web-push";
import { sendPushToAll, sendPushToUsers } from "./push";

/**
 * The number a push carries for the app's icon.
 *
 * iOS shows no count on a web app's icon unless the app sets one, and the
 * service worker that sets it on a push has nothing to go on but what the
 * push brought. These pin what it brings: the unread count of whoever is
 * signed in on that device, and nothing for a device nobody is.
 */

interface Doc {
  [key: string]: unknown;
}

/** Just enough of a database for `deliver` and the unread count it asks for. */
function fakeDb(data: { subs: Doc[]; users: Doc[] | Error; notifications: Doc[] }): Db {
  const cursor = (docs: Doc[]) => ({
    sort: () => cursor(docs),
    limit: () => cursor(docs),
    toArray: async () => docs,
  });
  return {
    collection: (name: string) => ({
      find: (filter: Doc) => {
        if (name === "pushSubscriptions") return cursor(data.subs);
        if (name === "users") {
          if (data.users instanceof Error) throw data.users;
          return cursor(data.users);
        }
        // A reader's feed is their own alerts and the market's news.
        const userId = ((filter.$or as Doc[])[0] as { userId: string }).userId;
        return cursor(
          data.notifications.filter((n) => n.userId === userId || n.kind === "news"),
        );
      },
    }),
  } as unknown as Db;
}

const KEYS = { p256dh: "p", auth: "a" };
const sent: { endpoint: string; body: Doc }[] = [];

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  sent.length = 0;
  mock.method(webpush, "setVapidDetails", () => {});
  mock.method(webpush, "sendNotification", async (sub: { endpoint: string }, body: string) => {
    sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
    return { statusCode: 201, body: "", headers: {} };
  });
});

afterEach(() => {
  mock.restoreAll();
});

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 13, 2, minutes));

test("a push carries how many alerts its reader has not opened", async () => {
  const db = fakeDb({
    subs: [{ endpoint: "https://push/phone", keys: KEYS, userId: "u1" }],
    users: [{ _id: "u1", notificationsRead: ["a1"] }],
    notifications: [
      { _id: "a1", userId: "u1", kind: "signal", createdAt: at(1) },
      { _id: "a2", userId: "u1", kind: "signal", createdAt: at(2) },
      { _id: "n1", kind: "news", createdAt: at(3) },
      // Somebody else's alert is not this reader's to count.
      { _id: "x1", userId: "u2", kind: "signal", createdAt: at(4) },
    ],
  });

  const result = await sendPushToUsers(db, ["u1"], { title: "APU", body: "ХУДАЛДАН АВАХ" });
  assert.equal(result.sent, 1);
  assert.deepEqual(sent[0].body, { title: "APU", body: "ХУДАЛДАН АВАХ", unread: 2 });
});

test("each device is told its own reader's count", async () => {
  const db = fakeDb({
    subs: [
      { endpoint: "https://push/one", keys: KEYS, userId: "u1" },
      { endpoint: "https://push/two", keys: KEYS, userId: "u2" },
      // Signed out: nobody's alerts to count, so no number at all.
      { endpoint: "https://push/nobody", keys: KEYS, userId: null },
    ],
    users: [
      { _id: "u1", notificationsRead: [] },
      { _id: "u2", notificationsDismissed: ["n1"] },
    ],
    notifications: [{ _id: "n1", kind: "news", createdAt: at(1) }],
  });

  await sendPushToAll(db, { title: "Шинэ мэдээ", body: "…" });
  const unread = Object.fromEntries(sent.map((s) => [s.endpoint, s.body.unread]));
  assert.deepEqual(unread, {
    "https://push/one": 1,
    "https://push/two": 0,
    "https://push/nobody": undefined,
  });
  assert.equal("unread" in sent.find((s) => s.endpoint.endsWith("nobody"))!.body, false);
});

test("a count that cannot be worked out does not hold the push back", async () => {
  mock.method(console, "error", () => {});
  const db = fakeDb({
    subs: [{ endpoint: "https://push/phone", keys: KEYS, userId: "u1" }],
    users: new Error("users unreachable"),
    notifications: [],
  });

  const result = await sendPushToUsers(db, ["u1"], { title: "APU", body: "…" });
  assert.equal(result.sent, 1);
  assert.deepEqual(sent[0].body, { title: "APU", body: "…" });
});
