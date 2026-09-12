import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { hashPassword, usernameFilter } from "@/lib/auth";
import { deleteUserEverywhere } from "@/lib/adminUsers";
import { isFounder, requireAdminRequest } from "@/lib/roles";
import type { Portfolio, Session, User } from "@/lib/types";

const MIN_USERNAME = 3;
const MIN_PASSWORD = 4;

/**
 * One account, as an administrator may change it.
 *
 * Unlike `/api/auth/profile`, no current password is asked for: the person
 * making the change is not the person whose account it is, and the whole point
 * of the page is to fix an account whose owner has lost their way into it. The
 * proof is the administrator's own session, checked on every call.
 *
 * Two things it will not do, both of them ways to lock the installation out of
 * its own administration: demote the first account opened, and demote the
 * administrator making the request.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;
  const { id } = await params;

  const user = await db.collection<User>("users").findOne({ _id: id } as never);
  if (!user) return NextResponse.json({ error: "Хэрэглэгч олдсонгүй" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : undefined;
  const username = text("username");
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : undefined;
  const cashBalance =
    typeof body.cashBalance === "number" && Number.isFinite(body.cashBalance)
      ? body.cashBalance
      : undefined;

  if (username !== undefined && username !== user.username) {
    if (username.length < MIN_USERNAME) {
      return NextResponse.json(
        { error: `Хэрэглэгчийн нэр дор хаяж ${MIN_USERNAME} тэмдэгт байна` },
        { status: 400 },
      );
    }
    const taken = await db
      .collection<User>("users")
      .findOne({ ...usernameFilter(username), _id: { $ne: id } } as never);
    if (taken) {
      return NextResponse.json(
        { error: "Энэ хэрэглэгчийн нэр аль хэдийн бүртгэгдсэн байна" },
        { status: 409 },
      );
    }
  }
  if (newPassword !== "" && newPassword.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байна` },
      { status: 400 },
    );
  }
  if (role === "user") {
    if (await isFounder(db, id)) {
      return NextResponse.json(
        { error: "Анхны бүртгэлийн админ эрхийг хасах боломжгүй" },
        { status: 409 },
      );
    }
    if (id === gate.admin._id) {
      return NextResponse.json(
        { error: "Өөрийнхөө админ эрхийг хасах боломжгүй" },
        { status: 409 },
      );
    }
  }
  if (cashBalance !== undefined && cashBalance < 0) {
    return NextResponse.json({ error: "Үлдэгдэл сөрөг байж болохгүй" }, { status: 400 });
  }

  const toSet: Record<string, unknown> = {};
  const toUnset: Record<string, ""> = {};
  // Sent as an empty string clears the field; omitted leaves it alone.
  for (const key of ["fullName", "email", "phone"] as const) {
    const value = text(key);
    if (value === undefined) continue;
    if (value === "") toUnset[key] = "";
    else toSet[key] = value;
  }
  if (username !== undefined && username !== "") toSet.username = username;
  if (role !== undefined) toSet.role = role;
  if (newPassword !== "") {
    const { hash, salt } = hashPassword(newPassword);
    toSet.passwordHash = hash;
    toSet.passwordSalt = salt;
  }

  if (Object.keys(toSet).length > 0 || Object.keys(toUnset).length > 0) {
    await db.collection<User>("users").updateOne({ _id: id } as never, {
      ...(Object.keys(toSet).length > 0 && { $set: toSet }),
      ...(Object.keys(toUnset).length > 0 && { $unset: toUnset }),
    });
  }
  if (cashBalance !== undefined) {
    await db
      .collection<Portfolio>("portfolios")
      .updateOne(
        { userId: id },
        { $set: { cashBalance, updatedAt: new Date() }, $setOnInsert: { userId: id } },
        { upsert: true },
      );
  }

  // A password someone else set ends every session on the account. Whoever was
  // signed in is exactly who the reset is usually aimed at.
  if (newPassword !== "") {
    await db.collection<Session>("sessions").deleteMany({ userId: id } as never);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;
  const { id } = await params;

  if (id === gate.admin._id) {
    return NextResponse.json({ error: "Өөрийн бүртгэлийг устгах боломжгүй" }, { status: 409 });
  }
  if (await isFounder(db, id)) {
    return NextResponse.json({ error: "Анхны бүртгэлийг устгах боломжгүй" }, { status: 409 });
  }
  const user = await db.collection<User>("users").findOne({ _id: id } as never);
  if (!user) return NextResponse.json({ error: "Хэрэглэгч олдсонгүй" }, { status: 404 });

  await deleteUserEverywhere(db, id);
  return NextResponse.json({ ok: true });
}
