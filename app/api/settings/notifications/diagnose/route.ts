import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { getDashboardRows } from "@/lib/data";
import type { Signal } from "@/lib/types";

export const maxDuration = 60;

interface SyncState {
  key: string;
  lastFullPriceSyncCompletedAt?: Date;
  lastSecuritiesSyncAt?: Date;
  priceCursor?: number;
}

/**
 * Why no alert arrived.
 *
 * A signal alert needs six things to line up: keys configured, a device
 * subscribed, the alert switch on, the transition in the operator's chosen
 * list, a sync having run, and a signal actually having changed. When one is
 * missing the app is silent, and from outside there is no way to tell which.
 */
export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, subscriptions, historyCount, syncState, notifications] =
    await Promise.all([
      getSettings(db),
      db.collection("pushSubscriptions").countDocuments(),
      db.collection("signalHistory").countDocuments(),
      db.collection<SyncState>("syncState").findOne({ key: "main" }),
      db
        .collection("notifications")
        .find({}, { projection: { _id: 0, title: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray(),
    ]);

  // What the next sync would find, without sending anything.
  const rows = await getDashboardRows(db).catch(() => []);
  const priced = rows.filter((r) => r.lastPrice !== null);
  const stored = await db
    .collection<{ companyCode: number; signal: Signal }>("signalHistory")
    .find({}, { projection: { _id: 0, companyCode: 1, signal: 1 } })
    .toArray();
  const previous = new Map(stored.map((h) => [h.companyCode, h.signal]));

  const pending = priced
    .filter((r) => previous.has(r.companyCode) && previous.get(r.companyCode) !== r.signal)
    .map((r) => ({
      symbol: r.symbol,
      from: previous.get(r.companyCode),
      to: r.signal,
      wouldAlert: settings.notifications.signals.includes(r.signal),
    }));

  const blockers: string[] = [];
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    blockers.push("VAPID түлхүүр тохируулаагүй — push илгээх боломжгүй.");
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    blockers.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY алга — хөтчөөс бүртгүүлэх боломжгүй.");
  }
  if (subscriptions === 0) {
    blockers.push("Ямар ч төхөөрөмж бүртгүүлээгүй — Профайл дээрээс мэдэгдлийг асаана уу.");
  }
  if (!settings.notifications.pushEnabled) {
    blockers.push("Тохиргоо дотор push мэдэгдэл унтраалттай байна.");
  }
  if (settings.notifications.signals.length === 0) {
    blockers.push("Ямар ч дохио сонгоогүй тул мэдэгдэх зүйл алга.");
  }
  if (historyCount === 0) {
    blockers.push(
      "Дохионы түүх хоосон — эхний sync зөвхөн суурийг тэмдэглэдэг, мэдэгдэл дараагийнхаас эхэлнэ.",
    );
  }

  return NextResponse.json({
    blockers,
    ready: blockers.length === 0,
    vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    subscriptions,
    pushEnabled: settings.notifications.pushEnabled,
    alertOnSignals: settings.notifications.signals,
    smsEnabled: settings.sms.enabled,
    smsRecipients: settings.sms.recipients.length,
    signalHistoryRows: historyCount,
    pricedRows: priced.length,
    lastSecuritiesSyncAt: syncState?.lastSecuritiesSyncAt ?? null,
    lastFullPriceSyncCompletedAt: syncState?.lastFullPriceSyncCompletedAt ?? null,
    priceCursor: syncState?.priceCursor ?? null,
    /** Transitions a sync run right now would report. */
    pendingChanges: pending.slice(0, 20),
    pendingChangeCount: pending.length,
    recentNotifications: notifications,
  });
}
