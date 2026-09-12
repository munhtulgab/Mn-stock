import { test } from "node:test";
import assert from "node:assert/strict";
import { dateFromArticle, dateFromText, dateFromUrl } from "./newsDates";

test("reads an ISO date, with or without a clock on it", () => {
  assert.equal(dateFromText("2026-09-12"), "2026-09-12");
  assert.equal(dateFromText("2026-09-12T10:00:00Z"), "2026-09-12");
  assert.equal(dateFromText("Нийтэлсэн: 2026-09-12 18:29:50"), "2026-09-12");
});

test("reads the dotted and slashed forms", () => {
  assert.equal(dateFromText("2026.09.12"), "2026-09-12");
  assert.equal(dateFromText("2026/9/2"), "2026-09-02");
});

test("reads the long form a Mongolian page prints for a reader", () => {
  assert.equal(dateFromText("2026 оны есдүгээр сарын 12"), "2026-09-12");
  assert.equal(dateFromText("2026 оны арван хоёрдугаар сарын 3"), "2026-12-03");
  assert.equal(
    dateFromText("Улаанбаатар, 2026 оны есдүгээр сарын 7 /МОНЦАМЭ/."),
    "2026-09-07",
  );
});

test("reads the same sentence with the month in digits", () => {
  assert.equal(dateFromText("2026 оны 9 дүгээр сарын 12"), "2026-09-12");
  assert.equal(dateFromText("2026 оны 11 дүгээр сарын 1"), "2026-11-01");
});

test("a year on its own is not a date", () => {
  assert.equal(dateFromText("Зохиогчийн эрх 2026"), null);
  assert.equal(dateFromText("огноогүй мөр"), null);
});

test("an impossible date is refused rather than rolled over", () => {
  assert.equal(dateFromText("2026-13-40"), null);
  assert.equal(dateFromText("2026-00-09"), null);
  assert.equal(dateFromText("1999-09-09"), null);
});

test("reads a date out of a path, including an image's", () => {
  assert.equal(
    dateFromUrl("//resource4.sodonsolution.org/unuudur/image/2026/09/11/x/1.jpg"),
    "2026-09-11",
  );
  assert.equal(dateFromUrl("https://x.mn/2026-09-11/slug"), "2026-09-11");
});

test("an id is not a date", () => {
  assert.equal(dateFromUrl("https://montsame.mn/mn/read/409596"), null);
  assert.equal(dateFromUrl("https://gogo.mn/i/9683"), null);
});

test("reads what an article page states about itself", () => {
  assert.equal(
    dateFromArticle('<meta property="article:published_time" content="2026-09-12T13:22:04+0800"/>'),
    "2026-09-12",
  );
  // The og:-prefixed variant unuudur.mn emits.
  assert.equal(
    dateFromArticle('<meta property="og:article:published_time" content="2022-12-09T13:22:04+0800"/>'),
    "2022-12-09",
  );
  assert.equal(dateFromArticle('{"datePublished":"2026-09-12T09:00:00+08:00"}'), "2026-09-12");
  assert.equal(dateFromArticle('<time datetime="2026-09-12">өнөөдөр</time>'), "2026-09-12");
});

test("falls back to a full timestamp in the markup, but not to a bare year", () => {
  assert.equal(
    dateFromArticle("<div class='body'>Нийтэлсэн 2026-09-12 18:29:50</div>"),
    "2026-09-12",
  );
  assert.equal(dateFromArticle("<footer>© 2026 Монцамэ</footer>"), null);
});
