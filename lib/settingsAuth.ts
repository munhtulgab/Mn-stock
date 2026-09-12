import type { Db } from "mongodb";
import { getTokenFromCookieHeader, getUserByToken } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

/**
 * Who may read and write the installation's settings.
 *
 * It began as a password prompt on top of the app login, then became "anyone
 * signed in" once `/settings` moved inside the `(app)` layout — which was the
 * right answer while every account belonged to the operator. It is not the
 * right answer now that the app has readers: API keys, the Facebook cookie,
 * the SMS sender and the push switch are the installation's, not theirs.
 *
 * Reads the cookie header rather than the request store because these are
 * called from route handlers that already hold the header.
 */
export async function isSettingsRequestAuthorized(
  db: Db,
  cookieHeader: string | null,
): Promise<boolean> {
  const token = getTokenFromCookieHeader(cookieHeader);
  if (!token) return false;
  return isAdmin(db, await getUserByToken(db, token));
}
