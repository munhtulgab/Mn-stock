import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";
import { recordNotification } from "@/lib/notifications";

/**
 * Sends a push to every registered device, on demand.
 *
 * Signal alerts only fire when a signal actually changes, which may be days
 * apart — so a device that never buzzes gives no evidence of whether the
 * chain is broken or simply had nothing to say. This exercises the same path
 * end to end (keys → subscription → push service → service worker) and
 * reports what each step returned.
 */
export async function POST() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptions = await db.collection("pushSubscriptions").countDocuments();
  if (subscriptions === 0) {
    return NextResponse.json({
      ok: false,
      sent: 0,
      subscriptions: 0,
      message: "Бүртгэлтэй төхөөрөмж алга — эхлээд Push мэдэгдлийг асаана уу.",
    });
  }

  const stamp = new Date().toLocaleTimeString("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = "MSE: туршилтын мэдэгдэл";
  const body = `Мэдэгдэл ажиллаж байна (${stamp}).`;

  // The phone banner and the in-app feed are two separate deliveries, and a
  // test that only exercises one leaves the other unproven — which is exactly
  // how a push could arrive while the Мэдэгдэл page stayed empty.
  await recordNotification(db, { title, body, url: "/notifications", kind: "system" });

  const result = await sendPushToAll(db, {
    title,
    body,
    url: "/notifications",
    tag: "mse-test",
  });

  return NextResponse.json({
    ok: result.sent > 0,
    ...result,
    subscriptions,
    message:
      result.sent > 0
        ? `${result.sent} төхөөрөмж рүү илгээлээ.`
        : (result.errors[0] ??
          "Илгээх боломжгүй байна — бүртгэл хүчингүй болсон байж магадгүй."),
  });
}
