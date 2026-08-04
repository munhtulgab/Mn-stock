import type { Db } from "mongodb";
import { getTokenFromCookieHeader, getUserByToken } from "@/lib/auth";

/**
 * Settings used to sit behind its own password prompt on top of the app
 * login. That second gate is redundant now that `/settings` already lives
 * inside the `(app)` layout, which redirects anyone without a session to
 * `/login` — so being logged in is the only check left.
 */
export async function isSettingsRequestAuthorized(
  db: Db,
  cookieHeader: string | null,
): Promise<boolean> {
  const token = getTokenFromCookieHeader(cookieHeader);
  if (!token) return false;
  return (await getUserByToken(db, token)) !== null;
}
