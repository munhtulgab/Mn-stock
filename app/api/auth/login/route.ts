import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  createSession,
  toSafeUser,
  usernameFilter,
  verifyPassword,
  SESSION_COOKIE,
} from "@/lib/auth";
import { isServiceAdmin } from "@/lib/roles";
import type { User } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Хэрэглэгчийн нэр, нууц үгээ оруулна уу" },
      { status: 400 },
    );
  }

  const db = await getDb();
  const user = await db
    .collection<User>("users")
    .findOne(usernameFilter(username));

  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return NextResponse.json(
      { error: "Хэрэглэгчийн нэр эсвэл нууц үг буруу байна" },
      { status: 401 },
    );
  }

  const token = await createSession(db, user._id!);
  // Where this account belongs. The app side would only bounce the dedicated
  // administrator straight back to /admin, and a redirect the reader can see
  // happening is a worse way to arrive than simply arriving.
  const redirectTo = isServiceAdmin(user) ? "/admin" : "/";
  const res = NextResponse.json({ user: toSafeUser(user), redirectTo });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
