import type { ProviderName } from "./types";
import { isChatModel, listModels } from "./models";

/**
 * One place that knows what each provider is called, what it answers to by
 * default, and how to ask it what else it can answer to.
 *
 * The default model used to live in the provider file and nowhere else, which
 * was fine while the only way to change it was a deployment. It is now a
 * setting an administrator can edit, so three things need the same answer —
 * the call itself, the page that shows what is configured, and the button
 * that tests a candidate — and three copies of a model name is how they drift.
 *
 * The environment variable stays in the middle of the order: a name set in
 * the settings wins over one in the environment, which wins over the default.
 * That way an installation pinned by its deployment keeps working exactly as
 * it did, and an administrator can still override it from the page without
 * anyone having to touch the environment.
 */

export interface ProviderCatalogEntry {
  /** What the settings page and the panel call it. */
  label: string;
  /** What it is asked for when nothing else says otherwise. */
  defaultModel: string;
  /** Checked before the default, kept for installations that pin one. */
  env: string;
  /**
   * The OpenAI-shaped root, where the provider has one. Null for the two
   * that do not — Gemini and Anthropic each have their own listing.
   *
   * Cloudflare's carries the account id, so it is a function rather than a
   * string: the token cannot be used to look the account up.
   */
  baseUrl: string | ((accountId: string) => string) | null;
  /** Whether the account id is needed before this provider can be reached. */
  needsAccountId?: boolean;
  /**
   * Names the listing will not return but the key can still call.
   *
   * Z.AI is the reason this exists. Its `/models` answers with the billed
   * catalogue only, and every free model — the ones this installation
   * actually runs on — is absent from it. A picker built from the listing
   * alone would have offered nothing that works.
   */
  extraModels?: string[];
}

export const PROVIDER_CATALOG: Record<ProviderName, ProviderCatalogEntry> = {
  anthropic: {
    label: "Anthropic (Claude)",
    defaultModel: "claude-sonnet-5",
    env: "ANTHROPIC_MODEL",
    baseUrl: null,
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-flash-latest",
    env: "GEMINI_MODEL",
    baseUrl: null,
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    env: "GROQ_MODEL",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    env: "OPENROUTER_MODEL",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  mistral: {
    label: "Mistral",
    defaultModel: "mistral-large-latest",
    env: "MISTRAL_MODEL",
    baseUrl: "https://api.mistral.ai/v1",
  },
  zai: {
    label: "Z.AI (GLM)",
    defaultModel: "glm-4.7-flash",
    env: "ZAI_MODEL",
    baseUrl: "https://api.z.ai/api/paas/v4",
    // Checked against the live API: both answer, neither is listed.
    extraModels: ["glm-4.7-flash", "glm-4.5-flash"],
  },
  nvidia: {
    label: "NVIDIA NIM",
    defaultModel: "deepseek-ai/deepseek-v4-flash-0731",
    env: "NVIDIA_MODEL",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    env: "CLOUDFLARE_MODEL",
    baseUrl: (accountId) =>
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    needsAccountId: true,
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDER_CATALOG) as ProviderName[];

export function isProviderName(value: unknown): value is ProviderName {
  return typeof value === "string" && value in PROVIDER_CATALOG;
}

/** The OpenAI-shaped root for a provider, once the account id is known. */
export function baseUrlFor(
  provider: ProviderName,
  accountId?: string,
): string | null {
  const { baseUrl } = PROVIDER_CATALOG[provider];
  if (typeof baseUrl === "function") return accountId ? baseUrl(accountId) : null;
  return baseUrl;
}

/**
 * The model to send, in the order the comment at the top describes.
 *
 * `configured` is whatever the settings hold for this provider, which is
 * undefined until somebody picks one on the page.
 */
export function resolveModel(
  provider: ProviderName,
  configured?: string,
): string {
  const entry = PROVIDER_CATALOG[provider];
  return configured?.trim() || process.env[entry.env] || entry.defaultModel;
}

/** Gemini answers `models/gemini-2.5-flash`; the request wants the tail. */
async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) return [];
  const data = await res.json();
  const rows: unknown[] = Array.isArray(data?.models) ? data.models : [];
  return rows
    .filter((row) => {
      const methods = (row as { supportedGenerationMethods?: string[] })
        .supportedGenerationMethods;
      // The listing includes embedders and token counters; only the ones that
      // can be asked a question belong in a picker.
      return !methods || methods.includes("generateContent");
    })
    .map((row) => String((row as { name?: unknown }).name ?? ""))
    .filter(Boolean)
    .map((name) => name.replace(/^models\//, ""));
}

async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const rows: unknown[] = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
}

/**
 * What this key can reach, best effort.
 *
 * An empty list is an answer rather than an error: several providers refuse
 * the listing to a key that can still hold a conversation, and the picker is
 * built to be typed into as well as chosen from. What it must never do is
 * throw — the page asks for this the moment a section is opened.
 */
export async function listProviderModels(
  provider: ProviderName,
  apiKey: string,
  accountId?: string,
): Promise<string[]> {
  const entry = PROVIDER_CATALOG[provider];
  let found: string[] = [];
  try {
    if (provider === "gemini") found = await listGeminiModels(apiKey);
    else if (provider === "anthropic") found = await listAnthropicModels(apiKey);
    else {
      const base = baseUrlFor(provider, accountId);
      if (base) found = await listModels(base, apiKey);
    }
  } catch {
    found = [];
  }

  // The default and the known-unlisted names are always offered, so a picker
  // can never be emptier than what the installation is already running on.
  const all = new Set([
    ...found.filter(isChatModel),
    ...(entry.extraModels ?? []),
    entry.defaultModel,
  ]);
  return [...all].sort((a, b) => a.localeCompare(b));
}
