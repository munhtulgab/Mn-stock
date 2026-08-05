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
   * Page access token for reading Facebook sources. Facebook serves a login
   * wall to anonymous readers and the Graph API refuses unauthenticated
   * reads, so any facebook.com source needs this to return anything.
   */
  facebookToken?: string;
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
    facebookToken: doc.facebookToken,
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
    facebookToken: mask(settings.facebookToken),
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
    facebookToken?: string;
    extraCaCerts?: string;
    apiKeys?: Partial<AppSettings["apiKeys"]>;
    sms?: Partial<SmsSettings>;
    notifications?: Partial<NotificationSettings>;
  },
): Promise<AppSettings> {
  const current = await getSettings(db);
  const next: AppSettings = {
    newsSources: patch.newsSources ?? current.newsSources,
    facebookToken: patch.facebookToken ?? current.facebookToken,
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
