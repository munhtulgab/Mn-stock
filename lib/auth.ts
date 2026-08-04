import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Db } from "mongodb";
import type { SafeUser, Session, User } from "@/lib/types";

export const SESSION_COOKIE = "mse_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/**
 * Case-insensitive exact-match filter for a username.
 *
 * The raw input must never reach a regex unescaped: a username of `.*`
 * matches every stored user (which would let signup's duplicate check be
 * dodged and hand login someone else's account row), and a nested quantifier
 * like `(a+)+` hangs the matcher on a long input. Escaping the metacharacters
 * keeps the pattern meaning the literal name and nothing else.
 */
export function usernameFilter(username: string) {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { username: { $regex: `^${escaped}$`, $options: "i" } };
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user._id!,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  };
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.collection<Session>("sessions").insertOne({
    token,
    userId,
    createdAt: now,
    expiresAt,
  });
  return token;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.collection<Session>("sessions").deleteOne({ token });
}

export async function getUserByToken(db: Db, token: string): Promise<User | null> {
  const session = await db.collection<Session>("sessions").findOne({ token });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const user = await db
    .collection<User>("users")
    .findOne({ _id: session.userId } as never);
  return user;
}

/**
 * Reads the session cookie from a Server Component / Route Handler context.
 *
 * Wrapped in React `cache` so the layout guard and the page body share one
 * session + user lookup per request instead of each issuing their own.
 */
export const getCurrentUser = cache(async (db: Db): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserByToken(db, token);
});

export function getTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}
