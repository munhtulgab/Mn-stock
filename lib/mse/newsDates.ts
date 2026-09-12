/**
 * Finding the day a story was published.
 *
 * The market-news page drops any item without a stated date, and it is right
 * to: a thirty-day window cannot honestly include something that might be
 * from 2019. But the rule was quietly throwing away whole publishers. A feed
 * states a date on every item and a JSON API does too, so ikon.mn, business.mn
 * and bloombergtv.mn all arrived; a site read by scraping its front page
 * states one nowhere the scraper looked, so montsame.mn contributed a hundred
 * and seventy-seven headlines and zero stories. Every HTML source on the
 * installation was in that second group.
 *
 * So look harder, in the order that costs least:
 *
 *   1. The link's own text, where a listing often prints the timestamp.
 *   2. The card around the link — a `<time>`, a date attribute, a date in
 *      the visible text, or a dated path in any URL inside it. unuudur.mn
 *      hides one in the article thumbnail's address, which is not where
 *      anybody would think to look and is a date all the same.
 *   3. The article itself, fetched. montsame.mn puts nothing on its front
 *      page and a full timestamp on every story, and there is no way to
 *      learn that without opening one.
 *
 * The third costs a request per story, so the caller decides how many are
 * worth it and asks only about stories it would actually publish.
 */

/** As the app writes a day everywhere else. */
export type Day = string;

const MONTHS: Record<string, number> = {
  нэгдүгээр: 1,
  хоёрдугаар: 2,
  гуравдугаар: 3,
  дөрөвдүгээр: 4,
  тавдугаар: 5,
  зургаадугаар: 6,
  зургадугаар: 6,
  долдугаар: 7,
  наймдугаар: 8,
  есдүгээр: 9,
  аравдугаар: 10,
  "арван нэгдүгээр": 11,
  "арван хоёрдугаар": 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rejects the impossible rather than letting `new Date` roll it over. */
function assemble(year: number, month: number, day: number): Day | null {
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * A date written the ways Mongolian news sites write them.
 *
 * ISO first because it is unambiguous, then the dotted and slashed forms,
 * then the long form a Mongolian page prints for a reader: "2026 оны
 * есдүгээр сарын 12", and the numeric variant of it, "2026 оны 9 дүгээр
 * сарын 12".
 *
 * Deliberately no day-first parsing. "05/09/2026" is the fifth of September
 * to half the world and the ninth of May to the other half, and a market
 * page that is four months wrong about a story is worse than one that does
 * not carry it.
 */
export function dateFromText(text: string): Day | null {
  const iso = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) return assemble(+iso[1], +iso[2], +iso[3]);

  const dotted = text.match(/(20\d{2})[./](\d{1,2})[./](\d{1,2})/);
  if (dotted) return assemble(+dotted[1], +dotted[2], +dotted[3]);

  // "2026 оны есдүгээр сарын 12"
  const named = text.match(
    /(20\d{2})\s*он[а-яөүё]*\s+((?:арван\s+)?[а-яөүё]+)\s+сар[а-яөүё]*\s+(\d{1,2})/i,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase().replace(/\s+/g, " ")];
    if (month) return assemble(+named[1], month, +named[3]);
  }

  // "2026 оны 9 дүгээр сарын 12", the same sentence with the month in digits.
  const numbered = text.match(
    /(20\d{2})\s*он[а-яөүё]*\s+(\d{1,2})\s*[-–]?\s*[а-яөүё]*\s*сар[а-яөүё]*\s+(\d{1,2})/i,
  );
  if (numbered) return assemble(+numbered[1], +numbered[2], +numbered[3]);

  return null;
}

/**
 * A date sitting in a URL: `/2026/09/11/slug`, and the same run of digits in
 * a query string or a filename. Publishers path their uploads by day even
 * when the page never prints one.
 */
export function dateFromUrl(url: string): Day | null {
  const path = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:[/-]|$|\?|#|\.)/);
  if (path) return assemble(+path[1], +path[2], +path[3]);
  return null;
}

/**
 * The published date an article page states about itself.
 *
 * Four places, because no two of these sites agree: the standard meta tag,
 * the `og:`-prefixed variant unuudur.mn emits, JSON-LD, and — for a page
 * that publishes none of the three — the first full timestamp in the markup,
 * which on montsame.mn is the byline it prints beside the headline.
 */
export function dateFromArticle(html: string): Day | null {
  const meta = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:)?(?:article:published_time|article:published|datePublished|pubdate|publish-date|date)["'][^>]*content=["']([^"']+)["']/i,
  );
  if (meta) {
    const found = dateFromText(meta[1]);
    if (found) return found;
  }

  const reversed = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:)?article:published_time["']/i,
  );
  if (reversed) {
    const found = dateFromText(reversed[1]);
    if (found) return found;
  }

  const jsonLd = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (jsonLd) {
    const found = dateFromText(jsonLd[1]);
    if (found) return found;
  }

  const time = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (time) {
    const found = dateFromText(time[1]);
    if (found) return found;
  }

  // Last resort: a full timestamp anywhere in the page. A bare date would
  // match a copyright year or an unrelated figure; a date with a clock on it
  // is somebody stating when something happened.
  const stamped = html.match(/(20\d{2})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/);
  if (stamped) return assemble(+stamped[1], +stamped[2], +stamped[3]);

  return null;
}
