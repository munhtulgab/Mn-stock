import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { baseUrlFor, resolveModel } from "./catalog";

/**
 * Cloudflare Workers AI, through its OpenAI-compatible endpoint.
 *
 * Unlike every other provider here, the account is part of the URL rather
 * than carried by the key, so this needs the account id as well as the
 * token. The token cannot be used to look it up — an API token without
 * Account:Read lists no accounts at all, which is the case for the one this
 * was written against — so it is a separate setting the operator fills in
 * from the Cloudflare dashboard.
 *
 * Without it the provider stays switched off rather than guessing: a request
 * to the wrong account id is a 404 the reader would have to decode.
 */
export async function callCloudflare(
  apiKey: string,
  accountId: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "cloudflare",
    baseUrl: baseUrlFor("cloudflare", accountId)!,
    apiKey,
    model: resolveModel("cloudflare", model),
    prompt,
  });
}
