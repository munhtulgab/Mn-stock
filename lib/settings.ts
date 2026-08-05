import type { Db } from "mongodb";
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
  };
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
    extraCaCerts: doc.extraCaCerts,
    apiKeys: doc.apiKeys ?? {},
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
    },
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
    extraCaCerts?: string;
    apiKeys?: Partial<AppSettings["apiKeys"]>;
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
