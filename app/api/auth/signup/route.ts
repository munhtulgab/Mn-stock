import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  createSession,
  hashPassword,
  toSafeUser,
  usernameFilter,
  SESSION_COOKIE,
} from "@/lib/auth";
import { SERVICE_ADMIN_USERNAME } from "@/lib/roles";
import type { Portfolio, User } from "@/lib/types";
import { STARTING_CASH_BALANCE } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;

  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Хэрэглэгчийн нэр дор хаяж 3 тэмдэгт байна" },
      { status: 400 },
    );
  }
  // Reserved, because the name is the role: whoever holds it administers the
  // installation and cannot be deleted. Without this, registering it would be
  // a way in rather than a sign-up. Only the admin area may create it, and
  // only while it does not already exist.
  if (username.toLowerCase() === SERVICE_ADMIN_USERNAME.toLowerCase()) {
    return NextResponse.json(
      { error: "Энэ хэрэглэгчийн нэрийг ашиглах боломжгүй" },
      { status: 409 },
    );
  }
  if (!password || password.length < 4) {
    return NextResponse.json(
      { error: "Нууц үг дор хаяж 4 тэмдэгт байна" },
      { status: 400 },
    );
  }

  const db = await getDb();
  const existing = await db
    .collection<User>("users")
    .findOne(usernameFilter(username));
  if (existing) {
    return NextResponse.json(
      { error: "Энэ хэрэглэгчийн нэр аль хэдийн бүртгэгдсэн байна" },
      { status: 409 },
    );
  }

  const { hash, salt } = hashPassword(password);
  const user: User = {
    _id: randomBytes(12).toString("hex"),
    username,
    passwordHash: hash,
    passwordSalt: salt,
    fullName,
    email,
    phone,
    createdAt: new Date(),
  };
  await db.collection<User>("users").insertOne(user as never);

  const portfolio: Portfolio = {
    userId: user._id!,
    cashBalance: STARTING_CASH_BALANCE,
    updatedAt: new Date(),
  };
  await db.collection<Portfolio>("portfolios").insertOne(portfolio as never);

  const token = await createSession(db, user._id!);
  const res = NextResponse.json({ user: toSafeUser(user) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
