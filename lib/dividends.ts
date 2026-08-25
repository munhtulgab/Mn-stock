import type { Db } from "mongodb";
import {
  fetchExchangeArticle,
  fetchExchangeNewsSince,
  type ExchangeNewsItem,
} from "@/lib/mse/exchangeNews";
import { pooled } from "@/lib/tdb/store";
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
  /** The year whose profit is being distributed, as the notice states it. */
  year: number;
  /** Tugriks per share, summed over every declaration made for that year. */
  amount: number;
  /** How many declarations that sum is made of — two for a half-yearly payer. */
  payments: number;
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
const SCHEMA_VERSION = 7;
/**
 * How far back the newsroom is read.
 *
 * This was a count — 120 notices — and a count is the wrong unit for an
 * archive whose density changes: the exchange files a trading report every
 * session plus whatever else happened that day, so 120 items is a few weeks
 * at the recent end. It reached 2024, and a bank that has paid a dividend
 * every year since it listed showed two of them.
 *
 * A date, and a page walk to reach it. 2016 rather than 2018 so the earliest
 * year the history card shows is itself surrounded by context rather than
 * sitting on the edge of what was read, and because a declaration for the
 * 2018 financial year is announced in 2019 — the year in the headline and the
 * year of publication are not the same, and only one of them can be paged to.
 *
 * Measured over the whole archive: 423 dividend notices back to 2011, against
 * the 58 one page reached.
 */
const NOTICES_FROM = "2016-01-01";
/**
 * A declaration is not reliably filed under the exchange's own "dividend"
 * tab. QPAY's 60₮ announcement of 2026-07-30 is in the general feed and
 * nowhere else, so both are read and merged; the amount pattern below is
 * what decides whether a story is a declaration, not which tab it sat in.
 */
const DIVIDEND_PHRASE = /ногдол\s+ашиг/i;
/**
 * Years kept per company.
 *
 * Everything, in practice. This was six, which made the history card a
 * six-year card whatever it was called — a company that has paid every year
 * since it listed had the earlier half of that quietly cut off. A declaration
 * is a few dozen bytes and the exchange's notices only go back so far anyway.
 */
const KEEP_YEARS = 40;

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
 *
 * A few words are allowed between the phrase and the number, and that is not
 * cosmetic: "Нэгж хувьцаа тус бүрд 141.73 төгрөгөөр тооцож" is how Хаан банк
 * announces its dividend, and requiring the digits to follow "хувьцаа"
 * immediately read that notice as having no figure in it at all. The filler
 * is listed rather than left as `\w+` so that a sentence which merely mentions
 * a share before quoting some other sum cannot be mistaken for a declaration.
 */
const FILLER = "(?:тус|бүр|бүрд|бүрт|тутам|тутамд|ногдох|ноогдох|нь)";

export function perShare(text: string): number | null {
  const match = new RegExp(
    `нэгж\\s+хувьцаа[а-яөүёА-ЯӨҮЁ]*(?:\\s+${FILLER}){0,3}\\s+([\\d,]+(?:\\.\\d+)?)\\s*(?:\\([^)]*\\)\\s*)?төгрөг`,
    "i",
  ).exec(text);
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
 * The year whose profit is being distributed, as the exchange states it.
 *
 * "«АПУ» ХК 2024 ОНЫ ХОЁРДУГААР ХАГАС ЖИЛИЙН ЦЭВЭР АШГААС" — the year in
 * front of "оны". That is the year an investor means when they say what a
 * company paid for a year, it is the year printed in the headline the row
 * links to, and it is therefore the only year this table can be checked
 * against.
 *
 * It briefly was the announcement year instead, because Datalab counts that
 * way and the two sources were being merged on it. They cannot be: Datalab's
 * АПУ 2024 is 99₮, which is 44₮ announced in February for the second half of
 * 2023 plus 55₮ announced in August for the first half of 2024 — one year's
 * cash, two years' profit. The exchange's own notices put 2024's two halves
 * at 55₮ and 65₮, so 2024 earned 120₮ and the card was showing 99.
 *
 * Older notices — "«АПУ» ХК НОГДОЛ АШИГ ТАРААХААР БОЛЛОО" — name no year at
 * all, and the half they were published in says which one they mean. A
 * declaration in the first half of a year is the previous year's result being
 * distributed once the accounts are closed; one in the second half is an
 * interim on the year in progress. Checked against the years АПУ does state:
 * the pattern holds through every notice back to 2016.
 */
const FIRST_HALF_MONTHS = 6;

export function profitYear(title: string, date: string): number {
  const stated = /(20\d{2})\s*ОНЫ/i.exec(title);
  if (stated) return Number(stated[1]);

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month <= FIRST_HALF_MONTHS ? year - 1 : year;
}

/**
 * Half the earnings, for a year with nothing declared on it yet.
 *
 * A profitable company that has not held its annual meeting shows a dash
 * against the current year, which is honest and says nothing about what a
 * shareholder might reasonably expect. This puts a figure there: half the
 * period's earnings per share, which is the payout ratio the larger MSE
 * payers have settled around.
 *
 * It is a calculation and not a declaration, and the card marks it as one by
 * setting it in brackets. Three things are worth being plain about:
 *
 *  - The half is an assumption. A company may pay all of its profit, none of
 *    it, or something in between, and nothing here knows which.
 *  - The earnings are the filing's, and MSE's quarterly filings are
 *    cumulative from January. At the second quarter this is therefore half of
 *    a half-year, not half of a year — it grows as the year is filed.
 *  - A loss produces nothing. A company cannot distribute what it did not
 *    make, and an estimate of a negative dividend is not a number anybody
 *    should be shown.
 *
 * EPS as filed is preferred over profit ÷ shares because it is the figure
 * printed a few lines above this on the same card, so a reader can halve it
 * themselves and arrive where the app did. The division is the fallback for
 * a filing that carries the profit but not the ratio.
 */
export const ESTIMATE_PAYOUT = 0.5;

export interface DividendEstimate {
  /** Tugriks per share. */
  amount: number;
  /** Against the current price, where there is one. */
  yieldPct: number | null;
}

export function estimatedDividend(
  financials: {
    eps: number | null;
    netProfit: number | null;
    sharesOutstanding: number | null;
  },
  price: number | null,
): DividendEstimate | null {
  const { eps, netProfit, sharesOutstanding } = financials;

  // A stated loss ends it, whatever the ratios say. Checked before EPS
  // because a filing can carry a positive EPS and a negative profit when the
  // two were taken from different periods.
  if (netProfit !== null && netProfit <= 0) return null;

  const perShare =
    eps !== null && eps > 0
      ? eps
      : netProfit !== null &&
          netProfit > 0 &&
          sharesOutstanding !== null &&
          sharesOutstanding > 0
        ? netProfit / sharesOutstanding
        : null;
  if (perShare === null) return null;

  const amount = perShare * ESTIMATE_PAYOUT;
  return {
    amount,
    yieldPct: price !== null && price > 0 ? (amount / price) * 100 : null,
  };
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

/**
 * Notices asked about at once when their figure is not in the standfirst.
 *
 * Six, matching what the rest of this app asks of the exchange. It is a few
 * dozen rounds of one small call, once a day, behind a response nobody is
 * waiting on.
 */
const ARTICLE_CONCURRENCY = 6;

/**
 * Each notice with the per-share figure it declares, dropping the ones that
 * declare none.
 *
 * Most notices state the amount in the standfirst the listing already
 * carries. About 150 of 331 do not — they give a payment date and leave the
 * figure to the article — and those years used to vanish from the history
 * with no sign that anything was missing. АПУ's whole 2025 was two such
 * notices, so a company that paid 145₮ that year showed nothing at all.
 *
 * So the article is read for those, and only those. Sampled across a dozen,
 * ten gave up their figure; the two that did not are notices which genuinely
 * never state one, and a year with no figure anywhere is better left blank
 * than guessed at.
 */
async function resolveAmounts(
  notices: ExchangeNewsItem[],
): Promise<{ notice: ExchangeNewsItem; amount: number }[]> {
  const resolved: { notice: ExchangeNewsItem; amount: number }[] = [];
  const needArticle: ExchangeNewsItem[] = [];

  for (const notice of notices) {
    const amount = perShare(`${notice.description} ${notice.title}`);
    if (amount !== null) resolved.push({ notice, amount });
    else needArticle.push(notice);
  }

  await pooled(needArticle, ARTICLE_CONCURRENCY, async (notice) => {
    const id = Number(notice.url.split("/").pop());
    if (!Number.isFinite(id)) return;
    const article = await fetchExchangeArticle(id).catch(() => null);
    if (!article) return;
    const text = article.body
      .map((block) => (block.kind === "table" ? block.rows.flat().join(" ") : block.text))
      .join(" ");
    const amount = perShare(text);
    if (amount !== null) resolved.push({ notice, amount });
  });

  return resolved;
}

async function computeDividends(
  db: Db,
): Promise<Record<string, Dividend[]>> {
  const [filed, general, securities] = await Promise.all([
    fetchExchangeNewsSince(NOTICES_FROM, "dividend"),
    fetchExchangeNewsSince(NOTICES_FROM),
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

  // Whose notice, and how much — resolved before anything is totalled,
  // because the ones that need their article read are fetched together
  // rather than one at a time down the loop.
  const declarations = await resolveAmounts(
    notices.filter((notice) => {
      if (seen.has(notice.url)) return false;
      seen.add(notice.url);
      return companyOf(notice.title, exact, prefixes, spaceless) !== null;
    }),
  );

  for (const { notice, amount } of declarations) {
    const companyCode = companyOf(notice.title, exact, prefixes, spaceless)!;
    const year = profitYear(notice.title, notice.date);
    const list = (byCompany[companyCode] ??= []);
    const existing = list.find((d) => d.year === year);

    // Added, not replaced. АПУ, Сүү, ТТЛ and others declare twice a year —
    // an interim on the first half and a final on the second — and keeping
    // only one notice per year reported half of what the company paid. It
    // reported the wrong half, too: the rule was "newest wins", so a year
    // showed one instalment and dropped the other.
    if (existing) {
      existing.amount += amount;
      existing.payments += 1;
      // The year's link points at its most recent notice.
      if (notice.date > existing.date) {
        existing.date = notice.date;
        existing.url = notice.url;
      }
      continue;
    }
    list.push({
      year,
      amount,
      payments: 1,
      yieldPct: null,
      url: notice.url,
      date: notice.date,
    });
  }

  for (const list of Object.values(byCompany)) {
    // Summing floats reintroduces the tail a rounded figure did not have:
    // 44 + 55 is 99 but 5.14 + 7.36 is 12.500000000000002.
    for (const row of list) row.amount = Math.round(row.amount * 1e6) / 1e6;
    list.sort((a, b) => b.year - a.year);
    list.splice(KEEP_YEARS);
  }
  return byCompany;
}

/** Reads the stored declarations, rebuilding them when they have gone stale. */
async function getAllDividends(db: Db): Promise<Record<string, Dividend[]>> {
  const cached = await db
    .collection<DividendSnapshot>("marketSnapshots")
    .findOne({ key: SNAPSHOT_KEY });

  // Anything stored is served, however old. Building this walks the exchange's
  // whole news archive — eleven pages of five hundred, eight seconds measured
  // — and a company page must not sit behind that. `refreshDividendsIfStale`
  // does it after the response instead.
  if (cached?.schemaVersion === SCHEMA_VERSION) return cached.byCompany;

  // Nothing servable: either the archive has never been read or the stored
  // shape predates a change to what these rows mean. Both are worth waiting
  // for once, because the alternative is an empty card.
  try {
    return await rebuildDividends(db);
  } catch (err) {
    console.error("dividend notices unavailable", err);
    return cached?.byCompany ?? {};
  }
}

async function rebuildDividends(db: Db): Promise<Record<string, Dividend[]>> {
  const byCompany = await computeDividends(db);
  await db.collection<DividendSnapshot>("marketSnapshots").updateOne(
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
}

/**
 * Rereads the archive when what is stored has gone stale, and otherwise does
 * one indexed read and nothing else.
 *
 * For calling after a response has been sent. A declaration is an annual
 * event; a day-old answer is the same answer, and nobody should watch a
 * spinner for the difference.
 */
export async function refreshDividendsIfStale(db: Db): Promise<boolean> {
  const cached = await db
    .collection<DividendSnapshot>("marketSnapshots")
    .findOne({ key: SNAPSHOT_KEY }, { projection: { computedAt: 1, schemaVersion: 1 } });

  const current =
    cached?.schemaVersion === SCHEMA_VERSION &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS;
  if (current) return false;

  try {
    await rebuildDividends(db);
    return true;
  } catch (err) {
    console.error("background dividend refresh failed", err);
    return false;
  }
}

/**
 * Every declaration this company has made, newest first, with the yield each
 * would give at today's price.
 *
 * The three-year card below answers "does it pay?"; this answers "how much,
 * and when did they say so?" — so unlike that card it keeps the notice's own
 * date and a link to it, and it does not manufacture rows for years with
 * nothing in them.
 */
export async function getDividendHistory(
  db: Db,
  companyCode: number,
  price: number | null,
): Promise<Dividend[]> {
  const all = await getAllDividends(db);
  return (all[String(companyCode)] ?? [])
    .map((d) => ({
      ...d,
      yieldPct: price && price > 0 ? (d.amount / price) * 100 : null,
    }))
    .sort((a, b) => b.year - a.year);
}
