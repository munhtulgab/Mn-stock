import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings, resolveApiKey } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import {
  PROVIDER_CATALOG,
  isProviderName,
  listProviderModels,
  resolveModel,
} from "@/lib/ai/providers/catalog";

export const dynamic = "force-dynamic";
/** Several providers answer their listing slowly; none of them stream it. */
export const maxDuration = 30;

/**
 * What one provider's key can actually reach.
 *
 * Behind the same gate as the settings page itself: the listing is read with
 * the installation's key, and which models an account can call is not
 * something a reader has any business asking.
 *
 * A provider that refuses the listing is not an error. Several answer it only
 * to keys with permissions the inference key does not need, and Z.AI answers
 * it with the billed catalogue while the free models it will happily run are
 * absent — so the picker on the page is a search box as well as a list, and
 * this route says how the list was obtained rather than pretending it is
 * complete.
 */
export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get("provider");
  if (!isProviderName(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const settings = await getSettings(db);
  const entry = PROVIDER_CATALOG[provider];
  const apiKey = resolveApiKey(
    settings,
    provider as keyof typeof settings.apiKeys,
    `${provider.toUpperCase()}_API_KEY`,
  );
  if (!apiKey) {
    return NextResponse.json(
      { error: "NO_KEY", message: `${entry.label}: API түлхүүр тохируулаагүй байна.` },
      { status: 400 },
    );
  }

  const accountId =
    settings.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (entry.needsAccountId && !accountId) {
    return NextResponse.json(
      { error: "NO_ACCOUNT", message: `${entry.label}: Account ID шаардлагатай.` },
      { status: 400 },
    );
  }

  const models = await listProviderModels(provider, apiKey, accountId);
  return NextResponse.json({
    provider,
    label: entry.label,
    models,
    current: resolveModel(provider, settings.aiModels?.[provider]),
    defaultModel: entry.defaultModel,
  });
}
