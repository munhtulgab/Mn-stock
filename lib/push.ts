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

/**
 * Sends a push notification to every stored subscription. Subscriptions
 * that the push service reports as gone (404/410 — the user uninstalled
 * the app or revoked permission) are pruned automatically.
 */
export async function sendPushToAll(
  db: Db,
  payload: NotificationPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!isConfigured()) {
    console.warn("Push not configured: VAPID keys missing");
    return { sent: 0, pruned: 0 };
  }
  configureWebPush();

  const subs = await db
    .collection<PushSubscriptionDoc>("pushSubscriptions")
    .find({})
    .toArray();

  let sent = 0;
  let pruned = 0;

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
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(db, sub.endpoint);
          pruned++;
        } else {
          console.error("push send failed", sub.endpoint, err);
        }
      }
    }),
  );

  return { sent, pruned };
}
