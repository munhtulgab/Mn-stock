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

test("a truncated answer is reported as a token limit, not a bad format", () => {
  // What a reasoning model's run looks like when its thinking eats the
  // completion allowance and the JSON stops mid-string.
  const raw =
    "cerebras MAX_TOKENS: хариу дуусахаас өмнө токений хязгаарт хүрлээ (үүнээс 1294 нь дотоод бодолтод зарцуулагдсан)";
  const message = humanizeProviderError("cerebras", raw);
  assert.match(message, /токений хязгаараас давж таслагдсан/);
  // Not the per-minute rule above it, which is a different failure and a
  // different fix — that one is about how much was sent, this about how
  // much room the answer had.
  assert.doesNotMatch(message, /минут тутмын/);
});

test("every message survives a second pass unchanged", () => {
  // Stored documents are re-humanised each time they are read, so a rule
  // that rewrote its own output would change the error on the second view.
  const raws = [
    'cloudflare API 401: {"errors":[{"code":10000,"message":"Authentication error"}]}',
    'cerebras API 402: {"message":"Payment required","code":"payment_required"}',
    "groq API 413: Request too large for model on tokens per minute (TPM)",
    "cerebras MAX_TOKENS: хариу дуусахаас өмнө токений хязгаарт хүрлээ",
    "gemini API 429: RESOURCE_EXHAUSTED quota",
  ];
  for (const raw of raws) {
    const once = humanizeProviderError("groq", raw);
    assert.equal(humanizeProviderError("groq", once), once, `unstable: ${raw}`);
  }
});

test("Mistral's subscription-tier refusal is not called an invalid key", () => {
  // Observed on a free account asking for mistral-large-latest. The key is
  // fine and the model is real; this plan may not call it, and sending the
  // reader to re-paste a key fixes nothing.
  const raw =
    'mistral API 403: {"object":"error","message":"This model is not available in your subscription tier","type":"tier_not_allowed","param":null,"code":"1910","raw_status_code":403}';
  const message = humanizeProviderError("mistral", raw);
  assert.match(message, /багц/);
  assert.doesNotMatch(message, /түлхүүр буруу/);
  assert.doesNotMatch(message, /quota/);
});

test("the tier message survives being re-read from a stored document", () => {
  // Cached documents are put back through here every time they are read, so
  // a rule that does not claim its own output rewrites itself into something
  // else on the second pass.
  const raw =
    'mistral API 403: {"type":"tier_not_allowed","message":"This model is not available in your subscription tier"}';
  const once = humanizeProviderError("mistral", raw);
  assert.equal(humanizeProviderError("mistral", once), once);
});

test("the substitution's own refusal reads as a plan limit, not a missing model", () => {
  // What is thrown when every model the key lists has been turned down.
  const raw = 'mistral model "mistral-small-latest" энэ түлхүүрээр ашиглах боломжгүй';
  assert.match(humanizeProviderError("mistral", raw), /багц/);
});
