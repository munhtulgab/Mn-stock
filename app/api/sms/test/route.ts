import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { sendSms } from "@/lib/callpro";

export async function POST(req: NextRequest) {
  if (!(await isSettingsRequestAuthorized(req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) {
    return NextResponse.json({ error: "Утасны дугаар оруулна уу" }, { status: 400 });
  }

  const db = await getDb();
  const { sms } = await getSettings(db);

  if (!sms.enabled) {
    return NextResponse.json(
      { error: "SMS илгээх тохиргоо унтраалттай байна" },
      { status: 400 },
    );
  }
  if (!sms.apiKey || !sms.from) {
    return NextResponse.json(
      { error: "CallPro API түлхүүр болон илгээгч дугаарыг эхлээд хадгална уу" },
      { status: 400 },
    );
  }

  const text =
    typeof body.text === "string" && body.text.trim()
      ? body.text.trim()
      : "MSE Invest: SMS тохиргоо амжилттай ажиллаж байна.";

  const result = await sendSms(
    { apiKey: sms.apiKey, from: sms.from, brand: sms.brand },
    to,
    text,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    messageId: result.messageId,
  });
}
