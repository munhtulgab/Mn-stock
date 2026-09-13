import { strict as assert } from "node:assert";
import { test } from "node:test";
import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callZai } from "./zai";
import type { AnalystPrompt } from "@/lib/ai/prompt";

const prompt: AnalystPrompt = { system: "заавар", user: "асуулт" };

/** The answer shape the schema accepts, as a provider would send it. */
const ANSWER = JSON.stringify({
  ticker: "APU",
  company_name: "АПУ ХК",
  timestamp: "2026-09-13T07:27:00Z",
  signal: "BUY",
  signal_confidence: 80,
  price_data: {
    current_price: 1043,
    target_price_1: 1100,
    target_price_2: 1150,
    stop_loss: 1000,
  },
  risk_assessment: {
    risk_level: "MEDIUM",
    risk_reward_ratio: "1:1.3",
    liquidity_risk: "LOW",
  },
  analysis_summary: {
    technical_reason: "RSI 50.23 · NEUTRAL.",
    fundamental_reason: "P/E 9.84 нь салбарын медианаас бага.",
    overall_logic: "Гурван талын дүгнэлт нэг чиглэлд нийцэж байна.",
  },
});

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/**
 * A fetch that answers from a script, recording what it was asked.
 *
 * Each entry is one reply, in order; the last one repeats if the code under
 * test goes round again, so a test that expects two calls and gets three
 * fails on the recorded calls rather than on an undefined response.
 */
function stubFetch(replies: { status: number; body: string }[]): {
  calls: Call[];
  restore: () => void;
} {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const reply = replies[Math.min(i, replies.length - 1)];
    i++;
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const ok = (text: string) => ({
  status: 200,
  body: JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }] }),
});

const geminiOk = (text: string) => ({
  status: 200,
  body: JSON.stringify({
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
  }),
});

test("Groq is asked for a bare JSON object", () => {
  const { calls, restore } = stubFetch([ok(ANSWER)]);
  return callGroq("k", prompt).then((res) => {
    restore();
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  });
});

test("a provider that refuses the hopeful field still gets an answer", async () => {
  // The whole point of asking for it optionally: `response_format` is
  // understood by the model configured today and may not be by whatever
  // GROQ_MODEL is pointed at tomorrow, and a request that is merely improved
  // by it must not become a request that fails without it.
  const { calls, restore } = stubFetch([
    { status: 400, body: '{"error":{"message":"response_format is not supported"}}' },
    ok(ANSWER),
  ]);
  const res = await callGroq("k", prompt);
  restore();
  assert.equal(res.ok, true, res.error);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.response_format, "the first try should ask");
  assert.equal(calls[1].body.response_format, undefined, "the second should not");
});

test("a 400 that names no model is the field's fault, not the model's", async () => {
  // The substitution machinery must not read a 400 about a request field as
  // a 400 about the name and go looking for a different model to send the
  // same bad request to — that costs a listing and a whole prompt against a
  // metered plan.
  const { calls, restore } = stubFetch([
    { status: 400, body: '{"error":{"message":"unknown parameter"}}' },
    ok(ANSWER),
  ]);
  await callGroq("k", prompt);
  restore();
  assert.equal(calls.length, 2);
  assert.ok(!calls.some((c) => c.url.endsWith("/models")), "no listing should be read");
  assert.equal(calls[1].body.model, calls[0].body.model, "the model should not change");
});

test("a retired model is replaced rather than blamed on the field", async () => {
  // The other side of that ordering. A name that is gone also answers 400,
  // and dropping the field first would spend a whole prompt against the
  // plan's allowance finding out the field was never the problem.
  //
  // Configured under a name of its own: what a key has been refused is
  // remembered for the life of the process, so a test that reused the
  // default name would be reading the other tests' history.
  const previous = process.env.GROQ_MODEL;
  process.env.GROQ_MODEL = "retired-model-2019";
  const { calls, restore } = stubFetch([
    { status: 400, body: '{"error":{"code":"model_not_found"}}' },
    { status: 200, body: JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }] }) },
    ok(ANSWER),
  ]);
  const res = await callGroq("k", prompt);
  restore();
  if (previous === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = previous;

  assert.equal(res.ok, true, res.error);
  assert.ok(calls[1].url.endsWith("/models"), "the listing should be read");
  assert.equal(calls[2].body.model, "llama-3.3-70b-versatile", "the substitute is used");
  assert.ok(calls[2].body.response_format, "the field should still be asked for");
});

test("an overloaded Gemini model is left for one that is not", async () => {
  const busy = {
    status: 503,
    body: '{"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}',
  };
  const { calls, restore } = stubFetch([busy, busy, geminiOk(ANSWER)]);
  const res = await callGemini("k", prompt);
  restore();
  assert.equal(res.ok, true, res.error);
  const models = calls.map((c) => c.url.match(/models\/([^:]+):/)?.[1]);
  assert.equal(models.length, 3);
  assert.equal(new Set(models).size, 3, `same model retried: ${models.join(", ")}`);
  assert.equal(models[0], "gemini-flash-latest", "the configured name goes first");
});

test("a 503 that is not an overload is retried rather than swapped", async () => {
  // Only "the model is overloaded" is about this model. A bare 503 is the
  // service, and moving to another name would waste the fallback on it.
  const down = { status: 503, body: "Service Unavailable" };
  const { calls, restore } = stubFetch([down, geminiOk(ANSWER)]);
  const res = await callGemini("k", prompt);
  restore();
  assert.equal(res.ok, true, res.error);
  const models = calls.map((c) => c.url.match(/models\/([^:]+):/)?.[1]);
  assert.deepEqual(models, ["gemini-flash-latest", "gemini-flash-latest"]);
});

test("every model being busy is reported as busy, not as something else", async () => {
  const busy = {
    status: 503,
    body: '{"error":{"message":"The model is overloaded.","status":"UNAVAILABLE"}}',
  };
  const { restore } = stubFetch([busy]);
  const res = await callGemini("k", prompt);
  restore();
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /503/);
});

test("Z.AI is asked to skip the thinking and answer in one object", () => {
  // GLM reasons before it answers and charges that to the completion
  // allowance: asked for fifty tokens it spent all fifty on reasoning and
  // returned an empty string. Disabled, the same call answers in 435.
  const { calls, restore } = stubFetch([ok(ANSWER)]);
  return callZai("k", prompt).then((res) => {
    restore();
    assert.equal(res.ok, true, res.error);
    assert.deepEqual(calls[0].body.thinking, { type: "disabled" });
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    assert.equal(calls[0].body.model, "glm-4.7-flash");
  });
});

/** How the free tier turns a request away: a 429 that is not a rate limit. */
const overloaded = {
  status: 429,
  body: '{"error":{"code":"1305","message":"The service may be temporarily overloaded, please try again later"}}',
};

test("a 429 that means 'busy' is retried, not reported", async () => {
  // Measured against the live API: the same prompt is refused on one attempt
  // and answered on the next, minutes apart, with nothing else changed.
  const { calls, restore } = stubFetch([overloaded, overloaded, ok(ANSWER)]);
  const res = await callZai("k", prompt);
  restore();
  assert.equal(res.ok, true, res.error);
  assert.equal(calls.length, 3);
});

test("a 429 that really is a spent balance is reported at once", async () => {
  // 1113 does not clear by waiting, so retrying it five times only makes the
  // reader wait longer for the same answer.
  const { calls, restore } = stubFetch([
    { status: 429, body: '{"error":{"code":"1113","message":"Insufficient balance or no resource package."}}' },
  ]);
  const res = await callZai("k", prompt);
  restore();
  assert.equal(res.ok, false);
  assert.equal(calls.length, 1, "it should not have been retried");
  assert.match(res.error ?? "", /1113/);
});

test("a busy provider that never clears gives up rather than looping", async () => {
  const { calls, restore } = stubFetch([overloaded]);
  const res = await callZai("k", prompt);
  restore();
  assert.equal(res.ok, false);
  // The first attempt plus the retries it is allowed, and no more.
  assert.equal(calls.length, 6);
  assert.match(res.error ?? "", /1305/);
});
