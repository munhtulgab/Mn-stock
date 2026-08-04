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

  if (fullName === "") {
    return NextResponse.json({ error: "Нэрээ оруулна уу" }, { status: 400 });
  }

  // A field omitted from the body is left untouched; a field sent as an
  // empty string clears it (fullName can't reach here empty, see above).
  const fields: [string, string | undefined][] = [
    ["fullName", fullName],
    ["email", email],
    ["phone", phone],
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
