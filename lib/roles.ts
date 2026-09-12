import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getCurrentUser, usernameFilter } from "@/lib/auth";
import type { User } from "@/lib/types";

/**
 * Who may administer the installation.
 *
 * Two ways to be one, and the second exists so there is always at least one.
 * An account is an administrator if its own document says so — which is what
 * the admin area's user list writes — and the first account ever opened is one
 * whether its document says so or not.
 *
 * Which account that is: the one called `admin`, or whatever ADMIN_USERNAME
 * names instead — and until such an account exists, the oldest one.
 *
 * That second rule is not a convenience. Roles arrived long after the app did,
 * so every account in the database predates the field: without a rule naming
 * one of them, the page that hands the role out sits behind the role it hands
 * out and nobody can ever reach it. It is permanent rather than a one-time
 * bootstrap for the same reason read the other way round — an installation
 * should not be able to lock itself out of its own administration with one
 * mis-click on the page that grants it.
 */
/**
 * The account this installation is administered from: `admin`, or whatever
 * ADMIN_USERNAME names instead.
 *
 * It does not have to exist. Until it does, the rules below fall back to the
 * oldest account, which is what keeps an installation that predates all of
 * this reachable.
 */
export const SERVICE_ADMIN_USERNAME =
  process.env.ADMIN_USERNAME?.trim() || "admin";

/**
 * Whether this is that account. Matched by name and case-insensitively, the
 * same way signing in matches it.
 */
export function isServiceAdmin(user: User | null | undefined): boolean {
  return user?.username?.toLowerCase() === SERVICE_ADMIN_USERNAME.toLowerCase();
}

export async function founderId(db: Db): Promise<string | null> {
  // The dedicated account owns the whole rule once it exists: the badge, the
  // role that cannot be taken away, and the account that cannot be deleted.
  // ADMIN_USERNAME renames it, which is the way back in if its password is
  // ever lost — point the variable at another account and redeploy.
  const named = await db
    .collection<User>("users")
    .findOne(usernameFilter(SERVICE_ADMIN_USERNAME), { projection: { _id: 1 } });
  if (named) return String(named._id);

  const first = await db
    .collection<User>("users")
    // By `_id` as well, so two accounts opened in the same millisecond — which
    // a seeded database does have — still name the same one every time.
    .find({}, { projection: { _id: 1 }, sort: { createdAt: 1, _id: 1 }, limit: 1 })
    .next();
  return (first?._id as string | undefined) ?? null;
}

export async function isAdmin(db: Db, user: User | null): Promise<boolean> {
  if (!user?._id) return false;
  if (user.role === "admin") return true;
  return (await founderId(db)) === user._id;
}

/** The account that cannot be demoted, deleted, or locked out. */
export async function isFounder(db: Db, userId: string): Promise<boolean> {
  return (await founderId(db)) === userId;
}

/**
 * The gate every admin page opens with.
 *
 * Called by each page rather than once in the layout on purpose: a layout does
 * not re-render on a client-side navigation between two of its own routes, so
 * a check that lives only there is made once and then trusted for the rest of
 * the visit. The layout does its own check as well, for the shell it draws.
 */
export async function requireAdminPage(db: Db): Promise<User> {
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  if (!(await isAdmin(db, user))) redirect("/");
  return user;
}

/**
 * The same gate for a route handler, which answers rather than redirects.
 *
 * Returns the administrator, or the response to send instead. Signed out is
 * 401 and signed in without the role is 403: the two are different answers to
 * the caller and only the first is fixed by logging in.
 */
export async function requireAdminRequest(
  db: Db,
): Promise<{ admin: User; error?: undefined } | { admin?: undefined; error: NextResponse }> {
  const user = await getCurrentUser(db);
  if (!user) {
    return { error: NextResponse.json({ error: "Нэвтрээгүй байна" }, { status: 401 }) };
  }
  if (!(await isAdmin(db, user))) {
    return { error: NextResponse.json({ error: "Зөвшөөрөлгүй" }, { status: 403 }) };
  }
  return { admin: user };
}
