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
