import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PROVIDER_CATALOG,
  PROVIDER_NAMES,
  baseUrlFor,
  isProviderName,
  listProviderModels,
  resolveModel,
} from "./catalog";

test("every provider in the union has a catalogue entry", () => {
  // The two lists are what keeps a new provider from being half-added: one
  // that is callable but has no entry cannot be picked or tested.
  assert.equal(PROVIDER_NAMES.length, Object.keys(PROVIDER_CATALOG).length);
  for (const name of PROVIDER_NAMES) {
    const entry = PROVIDER_CATALOG[name];
    assert.ok(entry.defaultModel, `${name} has no default model`);
    assert.ok(entry.label, `${name} has no label`);
    assert.match(entry.env, /_MODEL$/, `${name}: ${entry.env}`);
  }
});

test("Cerebras is gone", () => {
  assert.equal(isProviderName("cerebras"), false);
  assert.equal(isProviderName("zai"), true);
  assert.equal(isProviderName("nvidia"), true);
});

test("a picked model beats the environment, which beats the default", () => {
  const previous = process.env.GROQ_MODEL;

  delete process.env.GROQ_MODEL;
  assert.equal(resolveModel("groq"), PROVIDER_CATALOG.groq.defaultModel);

  process.env.GROQ_MODEL = "from-the-environment";
  assert.equal(resolveModel("groq"), "from-the-environment");
  assert.equal(resolveModel("groq", "from-the-page"), "from-the-page");

  // Blank is how the page says "back to the default", so it must not win.
  assert.equal(resolveModel("groq", "   "), "from-the-environment");

  if (previous === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = previous;
});

test("Cloudflare's root needs the account, and says so by returning null", () => {
  // The token cannot be used to look the account up, so a picker that
  // guessed would build a URL with "undefined" in it and 404 every request.
  assert.equal(baseUrlFor("cloudflare"), null);
  assert.match(baseUrlFor("cloudflare", "acc123") ?? "", /accounts\/acc123\/ai\/v1$/);
  assert.equal(PROVIDER_CATALOG.cloudflare.needsAccountId, true);
});

test("the two providers that are not OpenAI-shaped say so", () => {
  assert.equal(PROVIDER_CATALOG.gemini.baseUrl, null);
  assert.equal(PROVIDER_CATALOG.anthropic.baseUrl, null);
  assert.equal(PROVIDER_CATALOG.groq.baseUrl, "https://api.groq.com/openai/v1");
});

/** A listing that answers, one that refuses, and one that is not there. */
function stubFetch(reply: { status: number; body: string } | Error) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (reply instanceof Error) throw reply;
    return new Response(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = real; };
}

test("a listing is filtered to models that can hold a conversation", async () => {
  const restore = stubFetch({
    status: 200,
    body: JSON.stringify({
      data: [
        { id: "llama-3.3-70b-versatile" },
        { id: "whisper-large-v3" },
        { id: "text-embedding-3-large" },
      ],
    }),
  });
  const models = await listProviderModels("groq", "k");
  restore();
  assert.ok(models.includes("llama-3.3-70b-versatile"));
  assert.ok(!models.includes("whisper-large-v3"), "speech is not an analyst");
  assert.ok(!models.includes("text-embedding-3-large"));
});

test("a provider that refuses its listing still offers what works", async () => {
  // Several answer /models only to keys with permissions the inference key
  // does not need. An empty picker would be worse than a short one.
  const restore = stubFetch({ status: 403, body: "nope" });
  const models = await listProviderModels("groq", "k");
  restore();
  assert.deepEqual(models, [PROVIDER_CATALOG.groq.defaultModel]);
});

test("a listing that throws is an empty answer, never an exception", async () => {
  // The page asks for this the moment a section is opened.
  const restore = stubFetch(new Error("ECONNRESET"));
  const models = await listProviderModels("nvidia", "k");
  restore();
  assert.deepEqual(models, [PROVIDER_CATALOG.nvidia.defaultModel]);
});

test("Z.AI's free models are offered though the listing omits them", async () => {
  // Its /models answers with the billed catalogue only, and every model this
  // installation actually runs on is absent from it. A picker built from the
  // listing alone would have offered nothing that works.
  const restore = stubFetch({
    status: 200,
    body: JSON.stringify({ data: [{ id: "glm-5.3" }, { id: "glm-4.6" }] }),
  });
  const models = await listProviderModels("zai", "k");
  restore();
  assert.ok(models.includes("glm-4.7-flash"), models.join(", "));
  assert.ok(models.includes("glm-4.5-flash"));
  assert.ok(models.includes("glm-5.3"), "the listed ones are still offered");
});

test("Gemini's names come back without the models/ prefix", async () => {
  const restore = stubFetch({
    status: 200,
    body: JSON.stringify({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
      ],
    }),
  });
  const models = await listProviderModels("gemini", "k");
  restore();
  assert.ok(models.includes("gemini-2.5-flash"), models.join(", "));
  assert.ok(!models.includes("text-embedding-004"), "an embedder is not an analyst");
});

test("the list has no duplicates and is ordered", async () => {
  const restore = stubFetch({
    status: 200,
    body: JSON.stringify({ data: [{ id: "glm-4.7-flash" }, { id: "glm-4.6" }] }),
  });
  const models = await listProviderModels("zai", "k");
  restore();
  assert.equal(new Set(models).size, models.length, models.join(", "));
  assert.deepEqual(models, [...models].sort((a, b) => a.localeCompare(b)));
});
