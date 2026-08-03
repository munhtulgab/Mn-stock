import type { Db } from "mongodb";

export interface AppSettings {
  newsSources: string[];
  apiKeys: {
    anthropic?: string;
    gemini?: string;
    groq?: string;
    openrouter?: string;
  };
}

const SETTINGS_ID = "app";
const DEFAULT_SETTINGS: AppSettings = { newsSources: [], apiKeys: {} };

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
    apiKeys: doc.apiKeys ?? {},
  };
}

/** Masked view safe to send to the browser: keys become e.g. "sk-o***c798". */
export function maskSettings(settings: AppSettings) {
  const mask = (key?: string) =>
    !key ? null : key.length <= 8 ? "****" : `${key.slice(0, 4)}****${key.slice(-4)}`;
  return {
    newsSources: settings.newsSources,
    apiKeys: {
      anthropic: mask(settings.apiKeys.anthropic),
      gemini: mask(settings.apiKeys.gemini),
      groq: mask(settings.apiKeys.groq),
      openrouter: mask(settings.apiKeys.openrouter),
    },
  };
}

export async function updateSettings(
  db: Db,
  patch: {
    newsSources?: string[];
    apiKeys?: Partial<AppSettings["apiKeys"]>;
  },
): Promise<AppSettings> {
  const current = await getSettings(db);
  const next: AppSettings = {
    newsSources: patch.newsSources ?? current.newsSources,
    apiKeys: { ...current.apiKeys, ...patch.apiKeys },
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
