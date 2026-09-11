import { strict as assert } from "node:assert";
import { test } from "node:test";
import { __testing } from "./facebook";

const { parseMbasicPosts, toPosts, byNewest } = __testing;

/** Long enough to clear the minimum a post has to meet to count as prose. */
function prose(n: number): string {
  return `Энэ бол ${n} дугаар постын бичвэр бөгөөд хангалттай урт байна.`;
}

test("an Apify post keeps the hour it went out, in Ulaanbaatar time", () => {
  // 01:30 UTC is 09:30 the same morning in Ulaanbaatar, which is where the
  // feed states its times. Taken as the day alone this post was
  // indistinguishable from everything else the page wrote that day.
  const [post] = toPosts([{ text: prose(1), time: "2026-09-10T01:30:12.000Z" }]);
  assert.equal(post.date, "2026-09-10T09:30:12");
});

test("an Apify post dated late in the UTC evening belongs to the next day here", () => {
  const [post] = toPosts([{ text: prose(1), time: "2026-09-09T17:05:00.000Z" }]);
  assert.equal(post.date, "2026-09-10T01:05:00");
});

test("an epoch is read whether it is sent in seconds or milliseconds", () => {
  const seconds = toPosts([{ text: prose(1), timestamp: 1_788_000_000 }]);
  const millis = toPosts([{ text: prose(1), timestamp: 1_788_000_000_000 }]);
  assert.equal(seconds[0].date, millis[0].date);
  assert.equal(seconds[0].date?.length, 19);
});

test("a post with an unreadable stamp is dated not at all, rather than wrongly", () => {
  const [post] = toPosts([{ text: prose(1), time: "sometime last week" }]);
  assert.equal(post.date, undefined);
});

test("Apify posts come back newest first whatever order the run sent them", () => {
  const posts = toPosts([
    { text: prose(1), time: "2026-09-10T01:00:00.000Z" },
    { text: prose(2), time: "2026-09-10T05:00:00.000Z" },
    { text: prose(3), time: "2026-09-09T23:00:00.000Z" },
  ]);
  assert.deepEqual(
    posts.map((p) => p.date),
    ["2026-09-10T13:00:00", "2026-09-10T09:00:00", "2026-09-10T07:00:00"],
  );
});

test("an undated post sorts below every dated one", () => {
  const sorted = [
    { text: "no date" },
    { text: "older", date: "2026-09-01T10:00:00" },
    { text: "newer", date: "2026-09-08T10:00:00" },
  ].sort(byNewest);
  assert.deepEqual(sorted.map((p) => p.text), ["newer", "older", "no date"]);
});

test("mbasic reads the hour out of the post's own epoch", () => {
  const html = `
    <div data-ft='{"top_level_post_id":"1"}'>
      <abbr data-store='{"time":1788000000}'>10 minutes ago</abbr>
      <p>${prose(1)}</p>
    </div>`;
  const [post] = parseMbasicPosts(html);
  // 2026-08-29T10:40:00Z, which Ulaanbaatar states as 18:40 the same day.
  assert.equal(post.date, "2026-08-29T18:40:00");
});

test("mbasic falls back to the written day, without guessing at its hour", () => {
  // The written form is rendered in the reading account's timezone, which the
  // markup does not state — so the day stands and the hour is dropped.
  const html = `
    <div data-ft='{"top_level_post_id":"1"}'>
      <abbr>5 August 2026 at 10:03</abbr>
      <p>${prose(1)}</p>
    </div>`;
  const [post] = parseMbasicPosts(html);
  assert.equal(post.date, "2026-08-05");
});

test("mbasic posts are ordered by their epochs, not by where they sat in the page", () => {
  const html = ["1788000000", "1788009999", "1787000000"]
    .map(
      (time, i) => `
        <div data-ft='{"top_level_post_id":"${i}"}'>
          <abbr data-store='{"time":${time}}'>ago</abbr>
          <p>${prose(i)}</p>
        </div>`,
    )
    .join("");
  const dates = parseMbasicPosts(html).map((p) => p.date!);
  assert.deepEqual([...dates].sort().reverse(), dates);
});
