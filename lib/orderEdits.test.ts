import assert from "node:assert/strict";
import { test } from "node:test";
import { changesOf, editsByOrder, type OrderEdit, type OrderSnapshot } from "./orderEdits";

const at = (iso: string) => new Date(iso);
const stamp = (d: Date) => d.toISOString().slice(0, 16);
const order = (o: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  side: "BUY",
  quantity: 1000,
  price: 370,
  total: 370000,
  createdAt: at("2026-09-20T03:00:00Z"),
  ...o,
});

test("an edit lists only the fields it moved, with what they were", () => {
  const changes = changesOf(order(), order({ quantity: 1132, total: 418840 }), stamp);
  assert.deepEqual(
    changes.map((c) => c.label),
    ["Тоо", "Нийт"],
  );
  assert.equal(changes[0].from, "1,000 ш");
  assert.equal(changes[0].to, "1,132 ш");
});

test("money keeps its decimals rather than being rounded to whole tögrög", () => {
  const [price] = changesOf(order(), order({ price: 374.56 }), stamp);
  assert.equal(price.from, "370.00₮");
  assert.equal(price.to, "374.56₮");
});

test("side and time are named when they change", () => {
  const changes = changesOf(
    order(),
    order({ side: "SELL", createdAt: at("2026-09-20T03:15:00Z") }),
    stamp,
  );
  assert.deepEqual(changes.map((c) => [c.label, c.from, c.to]), [
    ["Төрөл", "Авсан", "Зарсан"],
    ["Огноо", "2026-09-20T03:00", "2026-09-20T03:15"],
  ]);
});

test("an edit that changed nothing says nothing", () => {
  assert.deepEqual(changesOf(order(), order(), stamp), []);
});

test("corrections are grouped by the order they were made to, newest first kept", () => {
  const edit = (orderId: string, minute: number): OrderEdit => ({
    userId: "u",
    orderId,
    companyCode: 1,
    symbol: "TUM",
    action: "edit",
    at: at(`2026-10-02T06:${String(minute).padStart(2, "0")}:00Z`),
    by: "admin",
    before: order(),
    after: order(),
  });
  const grouped = editsByOrder([edit("a", 30), edit("b", 20), edit("a", 10)]);
  assert.deepEqual(grouped.get("a")!.map((e) => e.at.getUTCMinutes()), [30, 10]);
  assert.equal(grouped.get("b")!.length, 1);
});
