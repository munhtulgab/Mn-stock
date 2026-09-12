import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  companyMatchTerms,
  companySearchTerms,
  matchHeadlines,
  type NewsSourceResult,
} from "./newsSources";

/** The listing as the exchange publishes it: a fund, named after a trust. */
const ALTT_NAME = "Гоулд Траст Хамтын биржээр арилжаалагддаг хөрөнгө оруулалтын сан";

function headlinesFrom(titles: string[]): NewsSourceResult[] {
  return [
    {
      url: "https://example.mn",
      text: "",
      status: "ok",
      chars: 0,
      headlines: titles.map((title) => ({
        title,
        url: `https://example.mn/${encodeURIComponent(title)}`,
      })),
    },
  ];
}

function matches(symbol: string, name: string, titles: string[]): Set<string> {
  const terms = companyMatchTerms(symbol, name);
  return new Set(matchHeadlines(headlinesFrom(titles), terms).map((h) => h.title));
}

test("the gold fund is matched on gold, which its own name never says", () => {
  // Nothing written about what moves this fund contains any part of its
  // registered name, so matched on the name alone it had no news at all.
  const found = matches("ALTT", ALTT_NAME, [
    "Алтны үнэ түүхэн дээд хэмжээндээ хүрлээ",
    "Монголбанк энэ онд 20 тонн алт худалдан авлаа",
    "Алт олборлолт өнгөрсөн оноос өслөө",
    "Уул уурхайн компаниуд алтаар баталгаажсан бонд гаргана",
    "Алтанд хөрөнгө оруулах сонирхол нэмэгдэж байна",
    "Gold price hits a record high",
    "XAU/USD хосын шинжилгээ",
    "Үнэт металлын зах зээлийн тойм",
    "Гоулд Траст сангийн нэгж эрхийн ханш",
  ]);
  assert.equal(found.size, 9, `only matched: ${[...found].join(" | ")}`);
});

test("a place that begins with the word for gold is not gold news", () => {
  // Why the endings are listed rather than the word matched as a prefix:
  // Mongolian glues its suffixes on, so "алт" has to reach "алтны" — and a
  // prefix reaches a province and a border town on the way.
  const found = matches("ALTT", ALTT_NAME, [
    "Алтай хотод шинэ үйлдвэр ашиглалтад орлоо",
    "Алтанбулаг боомтын хүчин чадал нэмэгдэнэ",
    "Алтан гадас одонгоор шагнав",
    "Goldman Sachs-ийн тайлан",
    "АПУ ХК-ийн хувьцаа өслөө",
  ]);
  assert.deepEqual([...found], []);
});

test("a company named after the metal is not the metal", () => {
  // Found against live sources rather than imagined: a piece on power
  // stations and tax exemptions came back as gold news, because the man
  // being interviewed chairs "Монголын Алт" (МАК) ХХК.
  const found = matches("ALTT", ALTT_NAME, [
    'Б.Нямтайшир: "Монголын Алт" (МАК) ХХК-ийн дарга цахилгаан станцын тухай ярилаа',
    "Алтан Дорнод Монгол ХХК тайлангаа тавилаа",
  ]);
  assert.deepEqual([...found], []);
});

test("a sentence about the metal survives a company form later in it", () => {
  // The exclusion above reaches across punctuation only, so a real sentence
  // that happens to mention a company further along still counts.
  const found = matches("ALTT", ALTT_NAME, [
    "Алт олборлогч ХХК-ууд экспортоо нэмэгдүүллээ",
    "Мөнгөжөөгүй алтны экспорт 2.80 тэрбум ам.доллар болж буурчээ",
  ]);
  assert.equal(found.size, 2, `only matched: ${[...found].join(" | ")}`);
});

test("a company is still matched on its own name and nothing wider", () => {
  // The subject list is for listings whose subject is a commodity. Widening
  // a company to a theme would file the whole sector under it.
  const found = matches("APU", "АПУ ХК", [
    "АПУ ХК-ийн хувьцаа өслөө",
    "Алтны үнэ түүхэн дээд хэмжээндээ хүрлээ",
  ]);
  assert.deepEqual([...found], ["АПУ ХК-ийн хувьцаа өслөө"]);
});

test("a fund is searched for its subject before its name", () => {
  // The half that was missing. Sources that search their own archive are
  // handed the string terms only, so ALTT was asked about "ALTT" and its
  // registered name — neither of which either site has ever printed — while
  // the archive full of gold stories went unqueried. Only the first couple
  // of queries are used, so the subject has to come first.
  const search = companySearchTerms("ALTT", ALTT_NAME);
  assert.deepEqual(search.slice(0, 2), ["алтны үнэ", "алтны нөөц"]);
  assert.ok(search.includes("ALTT"), "the name is still asked about, just later");
});

test("a company is searched for its own name and nothing else", () => {
  const search = companySearchTerms("APU", "АПУ ХК");
  assert.deepEqual(search, ["APU", "АПУ", "АПУ ХК"]);
});
