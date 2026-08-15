import { strict as assert } from "node:assert";
import { test } from "node:test";
import { __testing, type MarketNewsItem } from "./marketNews";

const { newStories, recentEnoughToAnnounce, storyKey, dedupe, hostname } =
  __testing;

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
