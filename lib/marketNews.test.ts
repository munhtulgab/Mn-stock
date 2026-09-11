import { strict as assert } from "node:assert";
import { test } from "node:test";
import { __testing, type MarketNewsItem } from "./marketNews";

const {
  byNewest,
  moment,
  newStories,
  recentEnoughToAnnounce,
  storyKey,
  dedupe,
  hostname,
} = __testing;

function item(over: Partial<MarketNewsItem> = {}): MarketNewsItem {
  return {
    title: "Хувьцааны арилжаа",
    url: "https://example.mn/news/1",
    source: "example.mn",
    date: "2026-08-14",
    ...over,
  };
}

function snapshot(items: MarketNewsItem[], announced?: string[]) {
  return { key: "market", items, computedAt: new Date(), announced };
}

test("the first build announces nothing", () => {
  assert.deepEqual(newStories(null, [item()]), []);
  assert.deepEqual(newStories(snapshot([]), [item()]), []);
});

test("a story already in the feed is not new", () => {
  const stored = item();
  assert.deepEqual(newStories(snapshot([stored]), [stored]), []);
});

test("a story that fell off the feed is not announced again", () => {
  // The page is capped, so a story leaves it once enough newer ones exist.
  // Coming back — because a source that had failed answered again — is not
  // the story happening a second time.
  const old = item({ url: "https://example.mn/news/7" });
  const previous = snapshot([item({ url: "https://example.mn/news/9" })], [
    storyKey(old),
  ]);
  assert.deepEqual(newStories(previous, [old]), []);
});

test("a genuinely unseen story is new", () => {
  const previous = snapshot([item({ url: "https://example.mn/news/9" })]);
  const fresh = item({ url: "https://example.mn/news/10" });
  assert.deepEqual(
    newStories(previous, [fresh]).map((i) => i.url),
    [fresh.url],
  );
});

test("only stories from the last day or so are worth announcing", () => {
  const from = "2026-08-14";
  const items = [
    item({ url: "a", date: "2026-08-15" }),
    item({ url: "b", date: "2026-08-14T09:30:00" }),
    item({ url: "c", date: "2026-08-04" }),
    item({ url: "d", date: "2026-07-30T23:59:00" }),
  ];
  assert.deepEqual(
    recentEnoughToAnnounce(items, from).map((i) => i.url),
    ["a", "b"],
  );
});

test("a day-only date on the cutoff still counts", () => {
  // Dated to midnight, so a plain `>=` on the day is what keeps it in.
  assert.equal(
    recentEnoughToAnnounce([item({ date: "2026-08-14" })], "2026-08-14").length,
    1,
  );
});

test("dedupe keeps the first copy of a story", () => {
  const fetched = item({ date: "2026-08-14T10:00:00" });
  const stored = item({ date: "2026-08-14" });
  const merged = dedupe([fetched, stored]);
  assert.equal(merged.length, 1);
  // The fetched row wins, which is how a stated hour reaches the feed.
  assert.equal(merged[0].date, "2026-08-14T10:00:00");
});

test("two stories at one url are told apart by their headline", () => {
  const live = item({ title: "Арилжааны тойм: өглөө" });
  const later = item({ title: "Арилжааны тойм: үдээс хойш" });
  assert.equal(dedupe([live, later]).length, 2);
});

test("hostname drops the scheme and www", () => {
  assert.equal(hostname("https://www.bloombergtv.mn/news"), "bloombergtv.mn");
  assert.equal(hostname("https://mse.mn/mn/news"), "mse.mn");
  // A Facebook page is configured by its full url and has to key on something.
  assert.equal(hostname("not a url"), "not a url");
});

test("a day's stories are ordered by the hour each one states", () => {
  // What a Facebook page's posts used to look like here: one stated day for
  // all of them, so the feed had nothing to order them by and showed them in
  // whatever order the scrape happened to return.
  const morning = item({ url: "https://example.mn/1", date: "2026-08-14T09:12:00" });
  const midday = item({ url: "https://example.mn/2", date: "2026-08-14T12:40:00" });
  const evening = item({ url: "https://example.mn/3", date: "2026-08-14T19:05:00" });

  assert.deepEqual(
    [morning, evening, midday].sort(byNewest).map((i) => i.url),
    [evening.url, midday.url, morning.url],
  );
});

test("a stated hour outranks the moment the feed happened to see the story", () => {
  // A post published at nine and fetched at half twelve is a nine o'clock
  // post. Before the hour was kept, every post of that day was filed under
  // the fetch instead, which is the same instant for all of them.
  const stated = item({ date: "2026-08-14T09:12:00", addedAt: "2026-08-14T04:30:00Z" });
  assert.equal(moment(stated), "2026-08-14T09:12:00");
});

test("a story with only a day still falls among the hours of that day", () => {
  const dayOnly = item({ date: "2026-08-14", addedAt: "2026-08-14T04:30:00Z" });
  // 04:30 UTC is half past twelve in Ulaanbaatar.
  assert.equal(moment(dayOnly), "2026-08-14T12:30");
});

test("a row with no stated hour is placed by its arrival read locally", () => {
  // The bug the news page had: `addedAt` is an ISO instant in UTC, and taken
  // raw it was compared against stamps stated in Ulaanbaatar time. A post
  // the feed met at 09:55Z appeared at 17:55 on the row and sorted as though
  // it were 09:55 — under every stated-time story of its afternoon.
  const facebook = item({
    url: "https://facebook.com/page",
    date: "2026-08-14",
    addedAt: "2026-08-14T09:55:02.000Z",
  });
  const exchange = item({ url: "https://mse.mn/news/1", date: "2026-08-14T16:24" });

  assert.equal(moment(facebook), "2026-08-14T17:55");
  assert.deepEqual(
    [exchange, facebook].sort(byNewest).map((i) => i.url),
    [facebook.url, exchange.url],
  );
});
