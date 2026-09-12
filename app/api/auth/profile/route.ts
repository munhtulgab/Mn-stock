import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  getCurrentUser,
  getTokenFromCookieHeader,
  hashPassword,
  toSafeUser,
  usernameFilter,
  verifyPassword,
} from "@/lib/auth";
import type { Session, User } from "@/lib/types";

/** The same floors signup holds new accounts to; see its route. */
const MIN_USERNAME = 3;
const MIN_PASSWORD = 4;

export async function PATCH(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) {
    return NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const avatar = typeof body.avatar === "string" ? body.avatar.trim() : undefined;
  const username = typeof body.username === "string" ? body.username.trim() : undefined;
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";

  // The two that change how the account is signed into. Both are proved with
  // the password already on the account: a session left open on a borrowed
  // phone should not be enough to take the account over, which is what
  // changing the name to log in under and the password to log in with is.
  const renaming = username !== undefined && username !== user.username;
  const rekeying = newPassword !== "";

  if (renaming && username.length < MIN_USERNAME) {
    return NextResponse.json(
      { error: `Хэрэглэгчийн нэр дор хаяж ${MIN_USERNAME} тэмдэгт байна` },
      { status: 400 },
    );
  }
  if (rekeying && newPassword.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байна` },
      { status: 400 },
    );
  }
  if (renaming || rekeying) {
    if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json(
        { error: "Одоогийн нууц үг буруу байна" },
        { status: 403 },
      );
    }
  }
  if (renaming) {
    // Case-insensitively, the way signing in matches it — and excluding this
    // account, so changing the capitalisation of your own name is allowed.
    const taken = await db
      .collection<User>("users")
      .findOne({ ...usernameFilter(username), _id: { $ne: user._id } } as never);
    if (taken) {
      return NextResponse.json(
        { error: "Энэ хэрэглэгчийн нэр аль хэдийн бүртгэгдсэн байна" },
        { status: 409 },
      );
    }
  }

  // Sent as a data URL, so its size is the request's size. The picture is
  // shrunk to 256px before it leaves the browser; anything much larger than
  // that is not a profile picture, and the user document is not the place
  // for it either way.
  if (avatar !== undefined && avatar !== "") {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) {
      return NextResponse.json({ error: "Зураг танигдсангүй" }, { status: 400 });
    }
    if (avatar.length > 400_000) {
      return NextResponse.json({ error: "Зураг хэт том байна" }, { status: 413 });
    }
  }

  if (fullName === "") {
    return NextResponse.json({ error: "Нэрээ оруулна уу" }, { status: 400 });
  }

  // A field omitted from the body is left untouched; a field sent as an
  // empty string clears it (fullName can't reach here empty, see above).
  const fields: [string, string | undefined][] = [
    ["fullName", fullName],
    ["email", email],
    ["phone", phone],
    ["avatar", avatar],
  ];
  const toSet: Record<string, string> = {};
  if (renaming) toSet.username = username;
  if (rekeying) {
    const { hash, salt } = hashPassword(newPassword);
    toSet.passwordHash = hash;
    toSet.passwordSalt = salt;
  }
  const toUnset: Record<string, ""> = {};
  for (const [key, value] of fields) {
    if (value === undefined) continue;
    if (value === "") toUnset[key] = "";
    else toSet[key] = value;
  }

  if (Object.keys(toSet).length > 0 || Object.keys(toUnset).length > 0) {
    await db.collection<User>("users").updateOne({ _id: user._id } as never, {
      ...(Object.keys(toSet).length > 0 && { $set: toSet }),
      ...(Object.keys(toUnset).length > 0 && { $unset: toUnset }),
    });
  }

  // A new password ends every other session. The one making the change keeps
  // its own — being signed out of the page you just used to change it is a
  // way of asking whether it worked.
  if (rekeying) {
    const token = getTokenFromCookieHeader(req.headers.get("cookie"));
    await db
      .collection<Session>("sessions")
      .deleteMany({ userId: user._id, ...(token ? { token: { $ne: token } } : {}) } as never);
  }

  const updated = await db.collection<User>("users").findOne({ _id: user._id } as never);
  return NextResponse.json({ user: toSafeUser(updated!) });
}
