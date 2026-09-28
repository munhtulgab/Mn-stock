import webpush from "web-push";
import type { Db } from "mongodb";

export interface PushSubscriptionDoc {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
  /**
   * Who is signed in on the device this subscription belongs to.
   *
   * A subscription is a device, not a person, and until this existed the app
   * could only ever speak to all of them at once. That is fine for a signal
   * change anybody might care about and useless for "a company you hold fell
   * six per cent" — which is only worth sending to the person who holds it,
   * and is nobody else's business. Null when the device is signed out, so a
   * phone that changes hands stops receiving the last owner's alerts.
   */
  userId?: string | null;
}

function isConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export async function saveSubscription(
  db: Db,
  sub: PushSubscriptionDoc,
): Promise<void> {
  // One upsert by endpoint: the same device re-sends its subscription on
  // every app open, which is also what re-points it at whoever is signed in.
  await db
    .collection<PushSubscriptionDoc>("pushSubscriptions")
    .updateOne(
      { endpoint: sub.endpoint },
      { $set: sub },
      { upsert: true },
    );
}

export async function removeSubscription(
  db: Db,
  endpoint: string,
): Promise<void> {
  await db.collection("pushSubscriptions").deleteOne({ endpoint });
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  pruned: number;
  /** Why the remaining subscriptions were not delivered to, if any. */
  errors: string[];
}

/** The push service's host, which is what identifies a device's browser. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.slice(0, 40);
  }
}

export async function sendPushToAll(
  db: Db,
  payload: NotificationPayload,
): Promise<PushResult> {
  return deliver(db, {}, payload);
}

/**
 * Sends to the devices of these readers only.
 *
 * For an alert raised because of what one person holds or watches. Devices
 * that have never told the server who is signed in on them — every one
 * subscribed before subscriptions carried a reader, until it is next opened —
 * are not reached; they still get everything market-wide.
 */
export async function sendPushToUsers(
  db: Db,
  userIds: string[],
  payload: NotificationPayload,
): Promise<PushResult> {
  if (userIds.length === 0) return { sent: 0, pruned: 0, errors: [] };
  return deliver(db, { userId: { $in: userIds } }, payload);
}

/**
 * Sends a push notification to every stored subscription matching `filter`.
 * Subscriptions that the push service reports as gone (404/410 — the user
 * uninstalled the app or revoked permission) are pruned automatically.
 *
 * Anything else that goes wrong is returned rather than only logged: a push
 * that never arrives looks identical from the outside whether the keys are
 * mismatched, the payload is too large or the service rejected the request,
 * and the operator has no other way to tell which.
 */
async function deliver(
  db: Db,
  filter: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<PushResult> {
  if (!isConfigured()) {
    console.warn("Push not configured: VAPID keys missing");
    return { sent: 0, pruned: 0, errors: ["VAPID түлхүүр тохируулаагүй."] };
  }
  configureWebPush();

  const subs = await db
    .collection<PushSubscriptionDoc>("pushSubscriptions")
    .find(filter)
    .toArray();

  let sent = 0;
  let pruned = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const { statusCode, body } = err as { statusCode?: number; body?: string };
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(db, sub.endpoint);
          pruned++;
        } else {
          console.error("push send failed", sub.endpoint, err);
          errors.push(
            `${endpointHost(sub.endpoint)}: ${statusCode ?? "?"} ${
              body?.trim() || (err as Error).message
            }`.slice(0, 200),
          );
        }
      }
    }),
  );

  return { sent, pruned, errors };
}
