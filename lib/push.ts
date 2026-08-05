import webpush from "web-push";
import type { Db } from "mongodb";

export interface PushSubscriptionDoc {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
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

/**
 * Sends a push notification to every stored subscription. Subscriptions
 * that the push service reports as gone (404/410 — the user uninstalled
 * the app or revoked permission) are pruned automatically.
 *
 * Anything else that goes wrong is returned rather than only logged: a push
 * that never arrives looks identical from the outside whether the keys are
 * mismatched, the payload is too large or the service rejected the request,
 * and the operator has no other way to tell which.
 */
export async function sendPushToAll(
  db: Db,
  payload: NotificationPayload,
): Promise<PushResult> {
  if (!isConfigured()) {
    console.warn("Push not configured: VAPID keys missing");
    return { sent: 0, pruned: 0, errors: ["VAPID түлхүүр тохируулаагүй."] };
  }
  configureWebPush();

  const subs = await db
    .collection<PushSubscriptionDoc>("pushSubscriptions")
    .find({})
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
