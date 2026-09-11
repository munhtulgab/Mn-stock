import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MODEL_PREFERENCES,
  isChatModel,
  isModelNotAllowed,
  isModelNotFound,
  isModelUnusable,
  pickModel,
} from "./models";
import { isTransientStatus, retryDelayMs } from "./transient";

test("speech, embedding and safety models are not analysts", () => {
  assert.equal(isChatModel("llama-3.3-70b-versatile"), true);
  assert.equal(isChatModel("whisper-large-v3"), false);
  assert.equal(isChatModel("distil-whisper-large-v3-en"), false);
  assert.equal(isChatModel("text-embedding-3-large"), false);
  assert.equal(isChatModel("meta-llama/llama-guard-4-12b"), false);
  assert.equal(isChatModel("playai-tts"), false);
});

test("a preference matches a name that has grown a suffix", () => {
  // Which is the whole point: the configured name was
  // llama-3.3-70b-versatile, and the preference is written without the tail.
  assert.equal(
    pickModel(["whisper-large-v3", "llama-3.3-70b-specdec"], MODEL_PREFERENCES.groq),
    "llama-3.3-70b-specdec",
  );
});

test("preferences are honoured in order, not by position in the listing", () => {
  assert.equal(
    pickModel(["llama-3.1-8b-instant", "llama-3.3-70b-versatile"], MODEL_PREFERENCES.groq),
    "llama-3.3-70b-versatile",
  );
});

test("nothing preferred still beats refusing to answer", () => {
  assert.equal(pickModel(["some-new-model-2027"], MODEL_PREFERENCES.groq), "some-new-model-2027");
});

test("a listing with no chat model at all picks nothing", () => {
  assert.equal(pickModel(["whisper-large-v3", "playai-tts"], MODEL_PREFERENCES.groq), null);
});

test("the retired-model refusal is told apart from other refusals", () => {
  // Groq's own words, from the screenshot that started this.
  assert.equal(
    isModelNotFound(
      404,
      '{"error":{"message":"The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.","type":"invalid_request_error","code":"model_not_found"}}',
    ),
    true,
  );
  assert.equal(isModelNotFound(404, "Not Found"), false);
  assert.equal(isModelNotFound(401, "model_not_found"), false);
  assert.equal(isModelNotFound(429, "rate limit"), false);
});

test("a busy fleet is retried and a rate limit is not", () => {
  assert.equal(isTransientStatus(503), true);
  assert.equal(isTransientStatus(500), true);
  assert.equal(isTransientStatus(504), true);
  // Carries its own Retry-After, which can be minutes — reported, not waited on.
  assert.equal(isTransientStatus(429), false);
  // The question was wrong; asking it again will not make it right.
  assert.equal(isTransientStatus(400), false);
  assert.equal(isTransientStatus(401), false);
});

test("backoff stays inside what a page render can hold", () => {
  assert.ok(retryDelayMs(1) + retryDelayMs(2) <= 2000);
});

test("a model the plan may not call is a reason to pick another one", () => {
  // What a free Mistral account answers to mistral-large-latest. Read as a
  // status alone it is a hard 403; read as a sentence it says "use a
  // different model", which is the same answer a retired name gets.
  const body =
    '{"object":"error","message":"This model is not available in your subscription tier","type":"tier_not_allowed","param":null,"code":"1910","raw_status_code":403}';
  assert.equal(isModelNotAllowed(403, body), true);
  assert.equal(isModelUnusable(403, body), true);
  // ...and it is not a model-not-found, which is a different status entirely.
  assert.equal(isModelNotFound(403, body), false);
});

test("an ordinary 403 is not a reason to go looking for another model", () => {
  assert.equal(isModelNotAllowed(403, '{"error":"Forbidden"}'), false);
  assert.equal(isModelNotAllowed(403, "You do not have permission"), false);
  // Nor is a refusal at any other status.
  assert.equal(isModelNotAllowed(429, "tier_not_allowed"), false);
});

test("upgrade-your-plan phrasings count too", () => {
  assert.equal(isModelNotAllowed(403, "Please upgrade your plan to use this"), true);
  assert.equal(isModelNotAllowed(403, "This model requires a paid account"), true);
});

test("a refused model is not picked again", () => {
  // The listing is the catalogue, not what the key may call: Mistral offers
  // mistral-large-latest to an account that is told it cannot have it. Left
  // in, the substitution picks the same name and goes in a circle.
  const listed = ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"];
  assert.equal(pickModel(listed, MODEL_PREFERENCES.mistral), "mistral-large-latest");
  assert.equal(
    pickModel(listed, MODEL_PREFERENCES.mistral, new Set(["mistral-large-latest"])),
    "mistral-medium-latest",
  );
  assert.equal(
    pickModel(
      listed,
      MODEL_PREFERENCES.mistral,
      new Set(["mistral-large-latest", "mistral-medium-latest"]),
    ),
    "mistral-small-latest",
  );
});

test("every model refused leaves nothing to substitute", () => {
  assert.equal(
    pickModel(["mistral-large-latest"], MODEL_PREFERENCES.mistral, new Set(["mistral-large-latest"])),
    null,
  );
});
