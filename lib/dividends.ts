import type { Db } from "mongodb";
import { fetchExchangeNews } from "@/lib/mse/exchangeNews";
import type { Security } from "@/lib/types";

/**
 * What each listed company has declared per share, read from the exchange's
 * own dividend notices.
 *
 * There is no dividend endpoint: open.mse.mn's company profile has tabs for
 * shareholders, board members and financials and none for payouts, and the
 * site's data fetcher has no route for it either. What the exchange does
 * publish is a notice per declaration, and each one states the amount in its
 * standfirst — "нэгж хувьцаанд 692 төгрөгийн ногдол ашиг хуваарилна". That
 * sentence is the source. Its own "dividend" tab does not hold all of them,
 * so the general feed is read as well.
 *
 * Which means this is only as complete as the exchange's newsroom: a company
 * that declared before the archive starts, or whose notice is worded in a
 * way the patterns below do not catch, will show fewer years than it paid.
 * Every figure that does appear is the exchange's own, though, which is the
 * trade worth making against a third party that carries nothing at all for
 * half the market.
 */

export interface Dividend {
  /** The year the profit was earned, as the notice states it. */
  year: number;
  /** Tugriks per share. */
  amount: number;
  /** Against the current price, where there is one. */
  yieldPct: number | null;
  /** The notice this was read from. */
  url: string;
  /** When the exchange published it. */
  date: string;
}

const SNAPSHOT_KEY = "dividends";
/** A declaration is an annual event; a day between rebuilds is plenty. */
const CACHE_MS = 24 * 60 * 60 * 1000;
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 4;
/** Notices to read back through — several years of declarations. */
const NOTICES = 120;
/**
 * A declaration is not reliably filed under the exchange's own "dividend"
 * tab. QPAY's 60₮ announcement of 2026-07-30 is in the general feed and
 * nowhere else, so both are read and merged; the amount pattern below is
 * what decides whether a story is a declaration, not which tab it sat in.
 */
const DIVIDEND_PHRASE = /ногдол\s+ашиг/i;
/** Years kept per company; older than this is history, not a figure. */
const KEEP_YEARS = 6;

interface DividendSnapshot {
  key: string;
  schemaVersion?: number;
  /** Company code to its declarations, newest year first. */
  byCompany: Record<string, Dividend[]>;
  computedAt: Date;
}

/**
 * The per-share amount out of a notice.
 *
 * The wording varies — "нэгж хувьцаанд 692 төгрөгийн", "нэгж хувьцаанд 80
 * төгрөг байхаар тогтоон", "нэгж хувьцаанд 2.49 төгрөгөөр тооцож" — but the
 * phrase before the number does not, so the number is taken from after it
 * rather than from anywhere in the sentence. A notice also states the total
 * paid out, in the billions, and picking the wrong one of the two would be
 * a dividend a thousand times too large.
 *
 * Many notices then spell the figure out — "500 (Таван зуу) төгрөгөөр" —
 * which is why the currency is allowed to arrive after a bracket rather than
 * straight after the digits.
 */
function perShare(text: string): number | null {
  const match =
    /нэгж\s+хувьцаа[а-яөүёА-ЯӨҮЁ]*\s+([\d,]+(?:\.\d+)?)\s*(?:\([^)]*\)\s*)?төгрөг/i.exec(
      text,
    );
  return match ? parseAmount(match[1]) : null;
}

/**
 * A written figure to a number, deciding what its commas are for.
 *
 * Both conventions appear in these notices: "4,400 төгрөг" is four thousand
 * four hundred, and "0,226 төгрөг буюу нийт 250,000,000" is a fifth of a
 * tugrik. Stripping every comma reads the second as 226 — a thousand times
 * the dividend the company declared — so a comma is only a thousands
 * separator where it can be one: never after a lone zero, and never with
 * fewer than three digits behind it.
 */
function parseAmount(raw: string): number | null {
  const decimalComma =
    (raw.match(/,/g) ?? []).length === 1 &&
    (/^0,/.test(raw) || /^\d+,\d{1,2}$/.test(raw));
  const amount = Number(
    decimalComma ? raw.replace(",", ".") : raw.replace(/,/g, ""),
  );
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * The year the profit was earned.
 *
 * "2025 ОНЫ ЦЭВЭР АШГААС" — the year in front of "оны", which is the year
 * being distributed rather than the year it is being distributed in. A
 * notice with no such year is dated by its own publication.
 */
function profitYear(title: string, date: string): number {
  const match = /(20\d{2})\s*ОНЫ/i.exec(title);
  const stated = match ? Number(match[1]) : NaN;
  return Number.isFinite(stated) ? stated : Number(date.slice(0, 4));
}

/**
 * Upper-cased, without quote marks or the legal form, for comparing names.
 *
 * The form is matched between spaces rather than with `\b`, which in
 * JavaScript means an ASCII word boundary and therefore finds none at all
 * after a Cyrillic "ХК" — the registry's "Инновэйшн инвестмент ХК" kept its
 * suffix, matched nothing the newsroom writes, and took the whole market's
 * dividends down with it.
 */
const LEGAL_FORM = /(?:^|\s)(ХК|ХХК|АА|ТӨХК|ТӨААТҮГ|ХУВЬЦААТ КОМПАНИ)(?=\s|$)/giu;

function normalize(name: string): string {
  return name
    .replace(/["“”«»']/g, "")
    .replace(LEGAL_FORM, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Short names carry no identity: "Ард" begins the name of several listings
 * and of a good many companies that are not listed at all.
 */
const MIN_DISTINCTIVE_CHARS = 5;

interface Listing {
  name: string;
  companyCode: number;
}

/**
 * Which listing a notice is about.
 *
 * The exchange opens every one of these with the company in quote marks —
 * `"ХУДАЛДАА ХӨГЖЛИЙН БАНК" ХК 2025 ОНЫ ...` — so the quoted name is what is
 * matched, exactly where it can be.
 *
 * It often cannot be. The registry holds the name a company listed under and
 * the newsroom writes the name it trades as, which is usually longer: QPAY
 * is registered as "Инновэйшн" and announced as "Инновэйшн инвестмент". So a
 * registered name that the announced one *begins with*, on a word boundary,
 * counts too — the longest such name, so a notice about "Ард санхүүгийн
 * нэгдэл" goes to that listing rather than to a listing called "Ард". Names
 * too short to identify anybody are not matched this way at all.
 */
function companyOf(
  title: string,
  exact: Map<string, number>,
  prefixes: Listing[],
  spaceless: Map<string, number>,
): number | null {
  const quoted = /^\s*["“«]([^"”»]+)["”»]/.exec(title);
  if (!quoted) return null;
  const name = normalize(quoted[1]);

  const direct = exact.get(name);
  if (direct !== undefined) return direct;

  let best: Listing | null = null;
  for (const listing of prefixes) {
    if (!name.startsWith(`${listing.name} `)) continue;
    if (!best || listing.name.length > best.name.length) best = listing;
  }
  if (best) return best.companyCode;

  // Last: the same name written without the space. The registry has "Таван
  // толгой" and the newsroom writes "ТАВАНТОЛГОЙ", which neither of the two
  // above can see past. Only names that stay unique once the spaces are
  // dropped are matched this way — two listings collapse onto
  // "МОНГОЛДААТГАЛ", and a guess between them is worse than no figure.
  return spaceless.get(collapse(name)) ?? null;
}

function collapse(name: string): string {
  return name.replace(/\s+/g, "");
}

/** Spaceless names that belong to exactly one listing. */
function unambiguousSpaceless(listings: Listing[]): Map<string, number> {
  const seen = new Map<string, number[]>();
  for (const listing of listings) {
    const key = collapse(listing.name);
    seen.set(key, [...(seen.get(key) ?? []), listing.companyCode]);
  }
  return new Map(
    [...seen.entries()]
      .filter(([, codes]) => new Set(codes).size === 1)
      .map(([key, codes]) => [key, codes[0]]),
  );
}

export async function computeDividends(
  db: Db,
): Promise<Record<string, Dividend[]>> {
  const [filed, general, securities] = await Promise.all([
    fetchExchangeNews(NOTICES, "dividend"),
    fetchExchangeNews(NOTICES),
    db
      .collection<Security>("securities")
      .find({}, { projection: { _id: 0, companyCode: 1, name: 1 } })
      .toArray(),
  ]);

  // Both feeds, the general one narrowed to stories that mention a payout,
  // deduplicated by the article each came from.
  const notices = [...filed, ...general.filter((n) => DIVIDEND_PHRASE.test(n.title))];
  const seen = new Set<string>();

  const listings: Listing[] = securities
    .map((s) => ({ name: normalize(s.name), companyCode: s.companyCode }))
    .filter((listing) => listing.name.length > 0);
  const exact = new Map(listings.map((l) => [l.name, l.companyCode]));
  const prefixes = listings.filter((l) => l.name.length >= MIN_DISTINCTIVE_CHARS);
  const spaceless = unambiguousSpaceless(prefixes);
  const byCompany: Record<string, Dividend[]> = {};

  for (const notice of notices) {
    if (seen.has(notice.url)) continue;
    seen.add(notice.url);
    const companyCode = companyOf(notice.title, exact, prefixes, spaceless);
    if (companyCode === null) continue;
    const amount = perShare(`${notice.description} ${notice.title}`);
    if (amount === null) continue;

    const year = profitYear(notice.title, notice.date);
    const list = (byCompany[companyCode] ??= []);
    // One declaration per year per company: the exchange sometimes follows a
    // notice with a correction or a reminder, and the newest is read first.
    if (list.some((d) => d.year === year)) continue;
    list.push({ year, amount, yieldPct: null, url: notice.url, date: notice.date });
  }

  for (const list of Object.values(byCompany)) {
    list.sort((a, b) => b.year - a.year);
    list.splice(KEEP_YEARS);
  }
  return byCompany;
}

/** Reads the stored declarations, rebuilding them when they have gone stale. */
async function getAllDividends(db: Db): Promise<Record<string, Dividend[]>> {
  const snapshots = db.collection<DividendSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  if (
    cached?.schemaVersion === SCHEMA_VERSION &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS
  ) {
    return cached.byCompany;
  }

  try {
    const byCompany = await computeDividends(db);
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          byCompany,
          computedAt: new Date(),
          schemaVersion: SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
    return byCompany;
  } catch (err) {
    console.error("dividend notices unavailable", err);
    return cached?.byCompany ?? {};
  }
}

/** One year's line, whether or not anything was declared for it. */
export interface DividendYear {
  year: number;
  /** Tugriks per share, or null where the exchange announced nothing. */
  amount: number | null;
  /** Against the current price. */
  yieldPct: number | null;
}

/** How many years the card shows, this one included. */
const YEARS_SHOWN = 3;

/**
 * The last three years for one company, in order, with the yield each would
 * give at today's price.
 *
 * Every year gets a line whether or not it has a figure. A company that paid
 * in 2025 and not in 2024 said something by not paying, and a card that
 * simply omits the year leaves the reader unable to tell that from a year
 * this app failed to read.
 */
export async function getDividendsFor(
  db: Db,
  companyCode: number,
  price: number | null,
  /** Today in Ulaanbaatar; passed in so nothing here reads the clock. */
  today: string,
): Promise<DividendYear[]> {
  const all = await getAllDividends(db);
  const declared = new Map(
    (all[String(companyCode)] ?? []).map((d) => [d.year, d.amount]),
  );

  const thisYear = Number(today.slice(0, 4));
  return Array.from({ length: YEARS_SHOWN }, (_, i) => {
    const year = thisYear - i;
    const amount = declared.get(year) ?? null;
    return {
      year,
      amount,
      yieldPct: amount !== null && price && price > 0 ? (amount / price) * 100 : null,
    };
  });
}
