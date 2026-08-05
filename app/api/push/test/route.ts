import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";

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
  const result = await sendPushToAll(db, {
    title: "MSE: туршилтын мэдэгдэл",
    body: `Мэдэгдэл ажиллаж байна (${stamp}).`,
    url: "/profile",
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
