import assert from "node:assert/strict";
import { test } from "node:test";
import { humanizeProviderError } from "./errorMessages";

/**
 * The strings below are real ones, copied from what these APIs actually
 * answered — not invented. Each of the three was mistaken for something else
 * before it had a rule, and each wrong message sent the reader somewhere
 * that could not fix it.
 */

test("Cloudflare's valid-but-unauthorised token is not called an invalid key", () => {
  // Observed: the token verifies as active, yet inference answers this.
  const raw =
    'cloudflare API 401: {"result":null,"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}';
  const message = humanizeProviderError("cloudflare", raw);
  assert.match(message, /Workers AI эрх/);
  assert.doesNotMatch(message, /түлхүүр буруу/);

  // And the account endpoint's own refusal says the same thing.
  const forbidden =
    'cloudflare API 403: {"success":false,"errors":[{"code":9109,"message":"Unauthorized to access requested resource"}]}';
  assert.match(humanizeProviderError("cloudflare", forbidden), /Workers AI эрх/);
});

test("a 402 is about money, not about waiting", () => {
  const raw =
    'cerebras API 402: {"message":"Payment required to access this resource. Visit your billing tab.","type":"payment_required_error","param":"quota","code":"payment_required"}';
  const message = humanizeProviderError("cerebras", raw);
  assert.match(message, /төлбөр/);
  // The body carries the word "quota", which the rate-limit rule would have
  // claimed — telling the reader to wait for something only money clears.
  assert.doesNotMatch(message, /Түр хүлээгээд/);
});

test("every message survives a second pass unchanged", () => {
  // Stored documents are re-humanised each time they are read, so a rule
  // that rewrote its own output would change the error on the second view.
  const raws = [
    'cloudflare API 401: {"errors":[{"code":10000,"message":"Authentication error"}]}',
    'cerebras API 402: {"message":"Payment required","code":"payment_required"}',
    "groq API 413: Request too large for model on tokens per minute (TPM)",
    "gemini API 429: RESOURCE_EXHAUSTED quota",
  ];
  for (const raw of raws) {
    const once = humanizeProviderError("groq", raw);
    assert.equal(humanizeProviderError("groq", once), once, `unstable: ${raw}`);
  }
});
