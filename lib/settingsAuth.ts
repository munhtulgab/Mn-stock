import { cookies } from "next/headers";

const COOKIE_NAME = "mse_settings_auth";

export async function isSettingsRequestAuthorized(
  cookieHeader: string | null,
): Promise<boolean> {
  const password = process.env.SETTINGS_PASSWORD;
  if (!password) return true; // no password configured: open (local/dev use only)
  if (!cookieHeader) return false;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  return decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) === password;
}

export async function isSettingsPageAuthorized(): Promise<boolean> {
  const password = process.env.SETTINGS_PASSWORD;
  if (!password) return true;
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === password;
}

export { COOKIE_NAME };
