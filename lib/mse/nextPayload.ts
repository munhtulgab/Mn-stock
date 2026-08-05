/**
 * Text recovery for Next.js App Router pages.
 *
 * These render to an almost empty `<body>` and ship their content inside
 * `self.__next_f.push([1, "..."])` script chunks — the streamed RSC payload
 * the client hydrates from. Reading the visible text of such a page yields a
 * nav bar and nothing else, while the payload holds the real copy:
 * invest.tdbs.mn goes from 487 characters of body text to some 58,000 here.
 *
 * Only a fallback. A server-rendered page always reads better from its own
 * markup, where words sit in document order rather than wire order.
 */

/** Strings shorter than this in the payload are wire plumbing, not copy. */
const MIN_STRING_CHARS = 20;

/** Guards against a pathological payload becoming the whole prompt. */
const MAX_TEXT_CHARS = 60_000;

/**
 * Concatenates the streamed chunks. Each is a JSON string literal, so the
 * escapes are undone by parsing it as one.
 */
function decodeChunks(html: string): string {
  let payload = "";
  for (const match of html.matchAll(
    /self\.__next_f\.push\(\[1\s*,\s*"((?:[^"\\]|\\.)*)"\]\)/g,
  )) {
    try {
      payload += JSON.parse(`"${match[1]}"`);
    } catch {
      // One malformed chunk shouldn't discard the rest of the stream.
    }
  }
  return payload;
}

/** Strings every Next.js build ships, regardless of what the site is about. */
const BOILERPLATE = new Set([
  "This page could not be found.",
  "Application error: a client-side exception has occurred",
]);

/**
 * Tailwind-style class attributes read as prose to a naive filter: several
 * words, letters throughout, spaces between. They are recognisable by their
 * tokens instead — `min-h-full`, `sm:px-6`, `flex` — which no sentence uses.
 */
function isClassList(value: string): boolean {
  const tokens = value.split(" ");
  if (tokens.length < 3) return false;
  const classish = tokens.filter((t) => /^[a-z0-9][a-z0-9:_\-[\]./%]*$/.test(t));
  return classish.length / tokens.length >= 0.75;
}

/**
 * Human-readable strings out of the RSC wire format. The payload interleaves
 * component references, module ids and props, so rather than parsing it we
 * keep the quoted runs that read like prose and drop the machinery.
 */
export function extractNextPayloadText(html: string): string {
  const payload = decodeChunks(html);
  if (!payload) return "";

  const seen = new Set<string>();
  const parts: string[] = [];
  let total = 0;

  for (const match of payload.matchAll(/"((?:[^"\\]|\\.){20,600})"/g)) {
    const value = match[1].replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();
    if (value.length < MIN_STRING_CHARS) continue;
    // Module paths, class-name soups, data URIs and the like carry no meaning.
    if (/^[\w$/.@-]+$/.test(value)) continue;
    if (/^(https?:|data:|\/_next\/)/.test(value)) continue;
    if (!/[\p{L}]{3,}/u.test(value)) continue;
    // Real copy has spaces; a long unbroken token is an id or a class list.
    if (!value.includes(" ")) continue;
    // Inlined stylesheets and font stacks travel in the payload too.
    if (/[{};]/.test(value) && value.includes(":")) continue;
    if (/sans-serif|monospace|Segoe UI|Roboto|Helvetica|@media|!important/i.test(value)) {
      continue;
    }
    // Framework furniture: the error template ships with every build.
    if (/^\d{3}:\s/.test(value)) continue;
    if (/next-error|__next|webpack|Content-Type|charset=/i.test(value)) continue;
    // Source-looking strings.
    if (/=>|\bfunction\s*\(|\bvar\s|\bconst\s/.test(value)) continue;
    if (BOILERPLATE.has(value)) continue;
    if (isClassList(value)) continue;
    if (seen.has(value)) continue;

    seen.add(value);
    parts.push(value);
    total += value.length + 1;
    if (total >= MAX_TEXT_CHARS) break;
  }

  return parts.join("\n");
}
