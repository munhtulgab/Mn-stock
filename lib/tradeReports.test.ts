import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./tradeReports";

const { selectTop20, dailyDay, PATTERNS } = __testing;

/**
 * The index summaries do not come from the exchange — mse.mn has never
 * published one — so they are found in the app's own feed and carried into
 * the day's slider without a body to read.
 */

const exchangeFeed = [
  {
    title: "8 ДУГААР САРЫН 7-НИЙ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
    date: "2026-08-07",
    url: "https://mse.mn/news/14850",
  },
  {
    title: "8 ДУГААР САРЫН 6-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
    date: "2026-08-06",
    url: "https://mse.mn/news/14840",
  },
];

test("the index summary is found in the app's feed and dated to its own day", () => {
  const feed = [
    {
      title: "ТОП-20 индекс 0.42 хувиар өслөө",
      date: "2026-08-07T16:20",
      url: "https://news.mn/r/2026/top20",
    },
    { title: "Өөр нэг мэдээ", date: "2026-08-07", url: "https://news.mn/r/other" },
  ];
  const slide = selectTop20(feed, dailyDay(exchangeFeed));
  assert.ok(slide);
  assert.equal(slide.title, "ТОП-20 индекс 0.42 хувиар өслөө");
  // Dated to the day, not the timestamp: the card prints this verbatim.
  assert.equal(slide.date, "2026-08-07");
  // No body to read — it lives on somebody else's site.
  assert.deepEqual(slide.body, []);
  // Credited to whoever published it, not to the exchange.
  assert.equal(slide.source, "news.mn");
  assert.equal(slide.id, undefined);
});

test("both spellings of the index are matched", () => {
  // "ТОП" in Cyrillic and "TOP" in Latin look identical on a screen.
  for (const title of [
    "ТОП-20 индекс 54,126.05 болж өндөрлөв",
    "TOP-20 индекс буурлаа",
    "ТОП 20 индекс тогтвортой байна",
    "топ-20 ИНДЕКС өсөв",
    "ТОП—20 индекс өсөв",
  ]) {
    assert.ok(PATTERNS.top20.test(title), `should match: ${title}`);
  }
});

test("only a story that leads with the index counts", () => {
  for (const title of [
    "МХБ-ийн ТОП-20 индекс өнөөдөр өслөө",
    "ТОП-20 компанийн жагсаалт шинэчлэгдлээ",
    "Зах зээлийн тойм",
  ]) {
    assert.ok(!PATTERNS.top20.test(title), `should not match: ${title}`);
  }
});

test("a summary older than the session on show is left out", () => {
  // The tab is headed by the 7th; last Tuesday's index in it would be read
  // as today's, and the title does not state the day.
  const stale = [
    { title: "ТОП-20 индекс өслөө", date: "2026-08-04", url: "https://news.mn/a" },
  ];
  assert.equal(selectTop20(stale, dailyDay(exchangeFeed)), null);
});

test("with no exchange report to head the day, the newest summary still shows", () => {
  const feed = [
    { title: "ТОП-20 индекс өслөө", date: "2026-08-07", url: "https://news.mn/a" },
  ];
  assert.ok(selectTop20(feed, dailyDay([])));
  assert.equal(dailyDay([]), null);
});

test("no summary in the feed is not an error", () => {
  assert.equal(selectTop20([], "2026-08-07"), null);
  assert.equal(
    selectTop20(
      [{ title: "Ямар нэг мэдээ", date: "2026-08-07", url: "https://news.mn/a" }],
      "2026-08-07",
    ),
    null,
  );
});

/**
 * The day's tab has two sides — the app's summary of a session and the
 * exchange's report on it — and they have to name the same day. The exchange
 * publishes a session's report a couple of hours after it closes, so from mid
 * afternoon its newest report is today's while the summary card is still
 * about the session before.
 */

test("the report follows the session the card covers", () => {
  const feed = [
    {
      title: "8 ДУГААР САРЫН 13-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
      date: "2026-08-13",
      url: "https://mse.mn/news/14900",
    },
    {
      title: "8 ДУГААР САРЫН 12-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
      date: "2026-08-12",
      url: "https://mse.mn/news/14890",
    },
  ];
  assert.equal(dailyDay(feed, "2026-08-12"), "2026-08-12");
});

test("nothing published on that session yet falls back to the newest", () => {
  // Before the exchange posts the 13th's report, the tab is the 13th's — a
  // tab called "the last day" with nothing in it is worse than a day older.
  assert.equal(dailyDay(exchangeFeed, "2026-08-13"), "2026-08-07");
});

test("no session asked for is the newest day that has a report", () => {
  assert.equal(dailyDay(exchangeFeed), "2026-08-07");
});

test("the index summary is held to the session, not to the newest report", () => {
  const reports = [
    {
      title: "8 ДУГААР САРЫН 13-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
      date: "2026-08-13",
      url: "https://mse.mn/news/14900",
    },
    {
      title: "8 ДУГААР САРЫН 12-НЫ ӨДРИЙН АРИЛЖААНЫ МЭДЭЭ",
      date: "2026-08-12",
      url: "https://mse.mn/news/14890",
    },
  ];
  const summaries = [
    { title: "ТОП-20 индекс 0.13 хувиар өслөө", date: "2026-08-12", url: "https://news.mn/r/a" },
  ];
  // Dated to the 12th, which is the session — under the old rule the day came
  // from the newest report, the 13th, and this slide was dropped as stale.
  assert.ok(selectTop20(summaries, dailyDay(reports, "2026-08-12")));
});
