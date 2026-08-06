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
 * publish is a notice per declaration, filed under its own "dividend"
 * category, and each one states the amount in its standfirst — "нэгж
 * хувьцаанд 692 төгрөгийн ногдол ашиг хуваарилна". That sentence is the
 * source.
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
const SCHEMA_VERSION = 1;
/** Notices to read back through — several years of declarations. */
const NOTICES = 120;
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
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
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

/** Upper-cased, without quote marks or the legal form, for comparing names. */
function normalize(name: string): string {
  return name
    .replace(/["“”«»']/g, "")
    .replace(/\s*(ХК|ХХК|АА|ТӨХК|ТӨААТҮГ)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Which listing a notice is about.
 *
 * The exchange opens every one of these with the company in quote marks —
 * `"ХУДАЛДАА ХӨГЖЛИЙН БАНК" ХК 2025 ОНЫ ...` — so the quoted name is matched
 * first and exactly. Falling back to "the name appears in the title" would
 * file a notice about "Ард санхүүгийн нэгдэл" under "Ард" as well.
 */
function companyOf(title: string, byName: Map<string, number>): number | null {
  const quoted = /^\s*["“«]([^"”»]+)["”»]/.exec(title);
  if (!quoted) return null;
  return byName.get(normalize(quoted[1])) ?? null;
}

export async function computeDividends(
  db: Db,
): Promise<Record<string, Dividend[]>> {
  const [notices, securities] = await Promise.all([
    fetchExchangeNews(NOTICES, "dividend"),
    db
      .collection<Security>("securities")
      .find({}, { projection: { _id: 0, companyCode: 1, name: 1 } })
      .toArray(),
  ]);

  const byName = new Map(securities.map((s) => [normalize(s.name), s.companyCode]));
  const byCompany: Record<string, Dividend[]> = {};

  for (const notice of notices) {
    const companyCode = companyOf(notice.title, byName);
    if (companyCode === null) continue;
    const amount = perShare(`${notice.description} ${notice.title}`);
    if (amount === null) continue;

    const year = profitYear(notice.title, notice.date);
    const list = (byCompany[companyCode] ??= []);
    // One declaration per year per company: the exchange sometimes follows a
    // notice with a correction or a reminder, and the first is the newest.
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

/**
 * One company's declarations, newest first, with the yield each would give
 * at today's price.
 */
export async function getDividendsFor(
  db: Db,
  companyCode: number,
  price: number | null,
): Promise<Dividend[]> {
  const all = await getAllDividends(db);
  const list = all[String(companyCode)] ?? [];
  return list.map((dividend) => ({
    ...dividend,
    yieldPct: price && price > 0 ? (dividend.amount / price) * 100 : null,
  }));
}
