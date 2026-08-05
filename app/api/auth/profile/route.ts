import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, toSafeUser } from "@/lib/auth";
import type { User } from "@/lib/types";

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

  const updated = await db.collection<User>("users").findOne({ _id: user._id } as never);
  return NextResponse.json({ user: toSafeUser(updated!) });
}
