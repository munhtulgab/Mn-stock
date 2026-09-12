import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, usernameFilter } from "@/lib/auth";
import { requireAdminRequest } from "@/lib/roles";
import { STARTING_CASH_BALANCE, type Portfolio, type User } from "@/lib/types";

/** The same floors signup holds new accounts to; see its route. */
const MIN_USERNAME = 3;
const MIN_PASSWORD = 4;

/**
 * Opens an account on someone's behalf.
 *
 * The same thing signup does, minus the session: an administrator making an
 * account is not logging into it. Everything else has to match, or an account
 * made here would be missing the portfolio every page assumes exists.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const role = body.role === "admin" ? "admin" : "user";

  if (username.length < MIN_USERNAME) {
    return NextResponse.json(
      { error: `Хэрэглэгчийн нэр дор хаяж ${MIN_USERNAME} тэмдэгт байна` },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байна` },
      { status: 400 },
    );
  }
  if (await db.collection<User>("users").findOne(usernameFilter(username))) {
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
    role,
    createdAt: new Date(),
  };
  await db.collection<User>("users").insertOne(user as never);
  const portfolio: Portfolio = {
    userId: user._id!,
    cashBalance: STARTING_CASH_BALANCE,
    updatedAt: new Date(),
  };
  await db.collection<Portfolio>("portfolios").insertOne(portfolio as never);

  return NextResponse.json({ id: user._id });
}
