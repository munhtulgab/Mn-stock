import {
  extractRetryAfterSeconds,
  formatRetryAfter,
  stripRetryAfterTag,
} from "@/lib/ai/retryAfter";

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

interface Rule {
  test: (msg: string) => boolean;
  message: (provider: string, retrySeconds: number | null) => string;
}

const RULES: Rule[] = [
  {
    test: (m) => /prepayment credits are depleted/i.test(m),
    message: (p) =>
      `${p}: Таны урьдчилсан төлбөрийн кредит дууссан байна. Төсөл болон төлбөр тооцоогоо удирдахын тулд https://ai.studio/projects хаягаар AI Studio руу очно уу. Дэлгэрэнгүй мэдээллийг https://ai.google.dev/gemini-api/docs/billing#prepay хаягаар авна уу.`,
  },
  {
    test: (m) => /RESOURCE_EXHAUSTED|429|rate.?limit|quota/i.test(m),
    message: (p, retrySeconds) =>
      retrySeconds !== null
        ? `${p}: Хүсэлтийн хязгаар (quota) дүүрсэн байна. ${formatRetryAfter(retrySeconds)} дараа дахин хүсэлт илгээх боломжтой.`
        : `${p}: Хүсэлтийн хязгаар (quota) дүүрсэн байна. Түр хүлээгээд дахин оролдоно уу, эсвэл API түлхүүрийн багцаа шинэчилнэ үү.`,
  },
  {
    test: (m) => /API_KEY_INVALID|API key not valid|invalid.?api.?key|401|Unauthorized|Incorrect API key/i.test(m),
    message: (p) =>
      `${p}: API түлхүүр буруу эсвэл хүчингүй байна. Тохиргоо хуудсан дээрээс шалгаж, дахин оруулна уу.`,
  },
  {
    test: (m) => /MAX_TOKENS|токений хязгаар/i.test(m),
    message: (p) =>
      `${p}: Хариу токений хязгаараас давж таслагдсан. Дахин оролдоход ихэвчлэн засагдана.`,
  },
  {
    test: (m) => /503|Service Unavailable|overloaded/i.test(m),
    message: (p) => `${p}: Сервер түр завгүй байна (503). Түр хүлээгээд дахин оролдоно уу.`,
  },
  {
    test: (m) => /timed?.?out|AbortError|ETIMEDOUT/i.test(m),
    message: (p) => `${p}: Хариу хугацаандаа ирсэнгүй (timeout). Дахин оролдоно уу.`,
  },
  {
    test: (m) => /Хариуг JSON болгож задлахад|Хариу тохирох бүтэцтэй биш/i.test(m),
    message: (p) => `${p}: Хариу буруу форматтай ирлээ. Дахин оролдоно уу.`,
  },
];

/**
 * Translates a provider's raw (often English/JSON) error into a short
 * human-readable Mongolian summary, falling back to the raw message
 * (still shown in full, just without a friendly headline) when no known
 * pattern matches so nothing is ever hidden.
 *
 * Safe to call on a message that's already been through this function
 * (e.g. a cached document written before a rule changed) — a leading
 * "Label: " from a previous pass is stripped before matching so results
 * never end up double-prefixed.
 */
export function humanizeProviderError(provider: string, rawError: string): string {
  const label = PROVIDER_LABEL[provider] ?? provider;
  const withoutPrefix = rawError.startsWith(`${label}: `)
    ? rawError.slice(label.length + 2)
    : rawError;
  // Only trust a retry hint on a message that hasn't been through this
  // function before — on a re-humanized cached doc the tag is already
  // gone, which correctly stops us from showing a stale countdown for an
  // error that may be hours old by the time it's re-read.
  const retrySeconds = extractRetryAfterSeconds(withoutPrefix);
  const message = stripRetryAfterTag(withoutPrefix);
  for (const rule of RULES) {
    if (rule.test(message)) return rule.message(label, retrySeconds);
  }
  return `${label}: ${message}`;
}
