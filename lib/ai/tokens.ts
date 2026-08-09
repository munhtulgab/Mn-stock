/**
 * How many tokens a prompt is likely to cost, erring high.
 *
 * This exists because a character count is not a token count, and the
 * difference is what broke Groq. The budget used to assume two characters
 * per token — true enough for English, and badly wrong for this app, which
 * writes almost everything in Mongolian Cyrillic. Measured against
 * cl100k_base:
 *
 *     Mongolian prose   1.33 characters per token
 *     English prose     5.05
 *     JSON punctuation  1.91
 *
 * So a page of Mongolian costs nearly four times what the same page of
 * English does, and a prompt that looked like nine thousand tokens was
 * fifteen. Groq's free tier allows twelve thousand a minute and refused the
 * whole request with a 413.
 *
 * Every provider tokenises differently and none of them publish the vocabulary
 * this would need to be exact, so this deliberately over-counts: a budget
 * that guesses low fails the request, where one that guesses high only sends
 * a slightly shorter prompt than it had to.
 */

/** Cyrillic, which the large multilingual vocabularies split near per-character. */
const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Non-Cyrillic characters per token. JSON — braces, quotes, digits, dates —
 * measures near 1.9, and prose near 5; this sits below even the JSON end,
 * because the payload is mostly JSON.
 */
const OTHER_CHARS_PER_TOKEN = 1.7;

export function estimateTokens(text: string): number {
  let cyrillic = 0;
  for (const char of text) if (CYRILLIC.test(char)) cyrillic++;
  const other = text.length - cyrillic;
  return Math.ceil(cyrillic + other / OTHER_CHARS_PER_TOKEN);
}
