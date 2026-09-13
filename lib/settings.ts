import type { Db } from "mongodb";
import { PROVIDER_NAMES, resolveModel } from "@/lib/ai/providers/catalog";
import type { Signal } from "@/lib/types";

export interface NotificationSettings {
  /** Master switch for web-push alerts. */
  pushEnabled: boolean;
  /** Only these signal transitions raise an alert. */
  signals: Signal[];
}

export interface SmsSettings {
  /** Master on/off switch for outbound SMS. */
  enabled: boolean;
  apiKey?: string;
  /** Sender number registered with CallPro. */
  from?: string;
  brand?: string;
  /** Numbers that receive signal alerts. */
  recipients: string[];
}

export interface AppSettings {
  newsSources: string[];
  /**
   * apify.com API token, used to read Facebook pages through their scraper.
   * A free account carries a monthly credit allowance and needs no card, and
   * unlike a cookie it puts none of the operator's own account at risk — so
   * it is the first route tried for a facebook.com source.
   */
  apifyToken?: string;
  /**
   * Page access token for reading Facebook sources. Facebook serves a login
   * wall to anonymous readers and the Graph API refuses unauthenticated
   * reads, so any facebook.com source needs this to return anything.
   */
  facebookToken?: string;
  /**
   * Facebook session cookie ("c_user=...; xs=...") used to read saved pages.
   * A token only reaches pages it was issued for, so this is what makes an
   * ordinary followed page readable. It is sent to facebook.com and nowhere
   * else, and it carries the account's full access — hence a secondary
   * account is the sane thing to use.
   */
  facebookCookie?: string;
  /**
   * Bearer token for marketinfo.mn's order-book endpoint.
   *
   * Everything else this app reads from marketinfo is public; the ladder of
   * standing orders is not, and answers `WWW-Authenticate: Bearer`. The token
   * their site carries is the signed-in reader's Google ID token, which lasts
   * an hour and cannot be refreshed outside their sign-in flow — so this is
   * an enhancement that lapses rather than a source to depend on. The trade
   * modal draws the book while it is valid and does without when it is not.
   */
  marketinfoToken?: string;
  /**
   * PEM bundle of intermediate certificates that sources fail to send
   * themselves (marketinfo.mn is one). Added to the trust list so those
   * sites verify — not a secret, and not a way around verification.
   */
  extraCaCerts?: string;
  apiKeys: {
    anthropic?: string;
    gemini?: string;
    groq?: string;
    openrouter?: string;
    mistral?: string;
    cloudflare?: string;
    zai?: string;
    nvidia?: string;
  };
  /**
   * The model each provider is asked for, where an administrator has picked
   * one.
   *
   * Sparse on purpose: a provider with no entry runs on whatever the
   * catalogue says, so an installation that never opens the page behaves
   * exactly as it did before there was one. See `resolveModel`.
   */
  aiModels?: Partial<Record<string, string>>;
  /**
   * Cloudflare puts the account in the URL rather than in the token, so
   * Workers AI needs this as well as the key. Not a secret — it appears in
   * every request path — and shown in full on the settings page so it can be
   * checked against the dashboard.
   */
  cloudflareAccountId?: string;
  sms: SmsSettings;
  notifications: NotificationSettings;
}

const SETTINGS_ID = "app";
const DEFAULT_SMS: SmsSettings = { enabled: false, recipients: [] };
const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  pushEnabled: true,
  signals: ["BUY", "SELL"],
};
const DEFAULT_SETTINGS: AppSettings = {
  newsSources: [],
  apiKeys: {},
  sms: DEFAULT_SMS,
  notifications: DEFAULT_NOTIFICATIONS,
};

interface SettingsDoc extends AppSettings {
  _id: string;
}

export async function getSettings(db: Db): Promise<AppSettings> {
  const doc = await db
    .collection<SettingsDoc>("settings")
    .findOne({ _id: SETTINGS_ID });
  if (!doc) return DEFAULT_SETTINGS;
  return {
    newsSources: Array.isArray(doc.newsSources) ? doc.newsSources : [],
    apifyToken: doc.apifyToken,
    facebookToken: doc.facebookToken,
    facebookCookie: doc.facebookCookie,
    marketinfoToken: doc.marketinfoToken,
    extraCaCerts: doc.extraCaCerts,
    apiKeys: doc.apiKeys ?? {},
    aiModels: doc.aiModels ?? {},
    cloudflareAccountId: doc.cloudflareAccountId,
    sms: {
      enabled: doc.sms?.enabled ?? false,
      apiKey: doc.sms?.apiKey,
      from: doc.sms?.from,
      brand: doc.sms?.brand,
      recipients: Array.isArray(doc.sms?.recipients) ? doc.sms.recipients : [],
    },
    notifications: {
      pushEnabled: doc.notifications?.pushEnabled ?? true,
      signals: Array.isArray(doc.notifications?.signals)
        ? doc.notifications.signals
        : DEFAULT_NOTIFICATIONS.signals,
    },
  };
}

/** Masked view safe to send to the browser: keys become e.g. "sk-o***c798". */
export function maskSettings(settings: AppSettings) {
  const mask = (key?: string) =>
    !key ? null : key.length <= 8 ? "****" : `${key.slice(0, 4)}****${key.slice(-4)}`;
  return {
    newsSources: settings.newsSources,
    apifyToken: mask(settings.apifyToken),
    facebookToken: mask(settings.facebookToken),
    facebookCookie: mask(settings.facebookCookie),
    marketinfoToken: mask(settings.marketinfoToken),
    // A certificate is public, but sending the whole bundle to the browser on
    // every settings load is pointless — the form only needs to know it's set.
    extraCaCount: settings.extraCaCerts
      ? (settings.extraCaCerts.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length
      : 0,
    apiKeys: {
      anthropic: mask(settings.apiKeys.anthropic),
      gemini: mask(settings.apiKeys.gemini),
      groq: mask(settings.apiKeys.groq),
      openrouter: mask(settings.apiKeys.openrouter),
      mistral: mask(settings.apiKeys.mistral),
      cloudflare: mask(settings.apiKeys.cloudflare),
      zai: mask(settings.apiKeys.zai),
      nvidia: mask(settings.apiKeys.nvidia),
    },
    // Not a secret: a model name is what the panel already shows.
    //
    // Two maps rather than one. `aiModels` is what an administrator picked,
    // which is empty for a provider nobody has touched; `aiModelsEffective`
    // is what that provider will actually be asked for, which needs the
    // environment and so has to be worked out here — a client component
    // reading `process.env` sees nothing and would show the catalogue
    // default to an installation that has pinned something else.
    aiModels: settings.aiModels ?? {},
    aiModelsEffective: Object.fromEntries(
      PROVIDER_NAMES.map((p) => [p, resolveModel(p, settings.aiModels?.[p])]),
    ),
    // Whether the provider can be called at all, which is not the same
    // question as whether a key is stored here: `resolveApiKey` falls back to
    // the environment, and an installation that sets its keys there was being
    // told on this page that it had none configured — with the model picker
    // disabled underneath the message, for a provider answering perfectly
    // well in the panel two clicks away.
    apiKeysAvailable: Object.fromEntries(
      PROVIDER_NAMES.map((p) => [
        p,
        Boolean(
          resolveApiKey(
            settings,
            p as keyof AppSettings["apiKeys"],
            `${p.toUpperCase()}_API_KEY`,
          ),
        ),
      ]),
    ),
    cloudflareAccountId: settings.cloudflareAccountId ?? null,
    sms: {
      enabled: settings.sms.enabled,
      apiKey: mask(settings.sms.apiKey),
      from: settings.sms.from ?? null,
      brand: settings.sms.brand ?? null,
      recipients: settings.sms.recipients,
    },
    notifications: settings.notifications,
  };
}

export async function updateSettings(
  db: Db,
  patch: {
    newsSources?: string[];
    apifyToken?: string;
    facebookToken?: string;
    facebookCookie?: string;
    marketinfoToken?: string;
    extraCaCerts?: string;
    apiKeys?: Partial<AppSettings["apiKeys"]>;
    aiModels?: Partial<Record<string, string>>;
    cloudflareAccountId?: string;
    sms?: Partial<SmsSettings>;
    notifications?: Partial<NotificationSettings>;
  },
): Promise<AppSettings> {
  const current = await getSettings(db);
  const next: AppSettings = {
    newsSources: patch.newsSources ?? current.newsSources,
    apifyToken: patch.apifyToken ?? current.apifyToken,
    facebookToken: patch.facebookToken ?? current.facebookToken,
    facebookCookie: patch.facebookCookie ?? current.facebookCookie,
    extraCaCerts: patch.extraCaCerts ?? current.extraCaCerts,
    apiKeys: { ...current.apiKeys, ...patch.apiKeys },
    // Merged rather than replaced, so saving one provider's model does not
    // clear the rest; an empty string is how the page says "back to default".
    aiModels: pruneModels({ ...current.aiModels, ...patch.aiModels }),
    cloudflareAccountId: patch.cloudflareAccountId ?? current.cloudflareAccountId,
    sms: { ...current.sms, ...patch.sms },
    notifications: { ...current.notifications, ...patch.notifications },
  };
  await db
    .collection<SettingsDoc>("settings")
    .updateOne({ _id: SETTINGS_ID }, { $set: next }, { upsert: true });
  return next;
}

/**
 * Falls back to the given env var when no key is stored in settings, so
 * ANTHROPIC_API_KEY set via Vercel env vars keeps working alongside
 * DB-managed keys for the other providers.
 */
export function resolveApiKey(
  settings: AppSettings,
  provider: keyof AppSettings["apiKeys"],
  envVar?: string,
): string | undefined {
  return settings.apiKeys[provider] || (envVar ? process.env[envVar] : undefined);
}

/** Drops the blanks, so "back to the default" is an absent key not an empty one. */
function pruneModels(
  models: Partial<Record<string, string>>,
): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(models).filter(([, v]) => typeof v === "string" && v.trim()),
  );
}
