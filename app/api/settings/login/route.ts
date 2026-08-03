import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/settingsAuth";

export async function POST(req: NextRequest) {
  const password = process.env.SETTINGS_PASSWORD;
  const body = await req.json().catch(() => ({}));
  const submitted = typeof body.password === "string" ? body.password : "";

  if (password && submitted !== password) {
    return NextResponse.json({ error: "Нууц үг буруу байна" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, password ?? "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
