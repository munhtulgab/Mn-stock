"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Num from "@/components/Num";
import StockAvatar from "@/components/StockAvatar";
import { ulaanbaatarDateTime, ulaanbaatarStamp } from "@/lib/day";
import { EditIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { AdminOrderRow } from "@/lib/adminUsers";

/**
 * Somebody's order history, as an administrator may correct it.
 *
 * Three things can be done to a row and they are not the same thing:
 *
 *   Засах  — the trade happened, the figures are wrong. Quantity, price, side
 *            and time are all editable, and the account moves by the
 *            difference between what was recorded and what is recorded now.
 *   Буцаах — the trade happened and is being unwound. A second, mirrored order
 *            is written, so the history says both.
 *   Устгах — the trade never should have been there at all. The row goes and
 *            the account is put back as if it never was.
 *
 * Every one of them moves the cash balance and the position with it; the
 * server does that arithmetic (`lib/adminOrders.ts`) rather than this page.
 *
 * None of the three goes through on one tap. Each opens a dialog naming what
 * it will do to this account's cash and position, with the figures it will do
 * it with — Засах included, which used to be the one that saved the moment
 * Хадгалах was pressed. It is the least alarming-looking of the three and it
 * can move a balance as far as either of the others, so it asks too.
 */

type Pending = { id: string; mode: "edit" | "delete" | "reverse" } | null;

/** An edit that has been filled in and is waiting to be confirmed. */
interface PendingEdit {
  id: string;
  patch: { side: "BUY" | "SELL"; quantity: number; price: number; createdAt: string };
}

export default function AdminOrderRows({
  userId,
  orders,
}: {
  userId: string;
  orders: AdminOrderRow[];
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [confirmEdit, setConfirmEdit] = useState<PendingEdit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function send(id: string, path: string, init: RequestInit, done: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${userId}/orders/${id}${path}`, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Болсонгүй");
      toast({ title: done, variant: "success" });
      setPending(null);
      setConfirmEdit(null);
      router.refresh();
    } catch (err) {
      toast({
        title: "Болсонгүй",
        body: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  if (orders.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
        Энэ хэрэглэгч арилжаа хийгээгүй байна.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider">
      {orders.map((order) => {
        const open = pending?.id === order.id;
        return (
          <div key={order.id} className="px-4 py-3" data-order={order.id}>
            <div className="flex items-center gap-3">
              <StockAvatar symbol={order.symbol} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-app-text">{order.symbol}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      order.side === "BUY"
                        ? "bg-app-positive-bg text-app-positive"
                        : "bg-app-negative-bg text-app-negative"
                    }`}
                  >
                    {order.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
                  </span>
                  {order.imported && <Tag>ХУУЛГА</Tag>}
                  {order.reversalOf && <Tag>БУЦААЛТ</Tag>}
                  {order.reversedBy && <Tag>БУЦААГДСАН</Tag>}
                  {order.editedAt && <Tag>ЗАССАН</Tag>}
                </div>
                <div className="text-xs text-app-muted">
                  {ulaanbaatarDateTime(order.createdAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm text-app-text">
                  <span className="text-xs text-app-muted">{order.quantity} ш × </span>
                  <Num value={order.price} digits={2} suffix="₮" />
                </div>
                <div className="text-xs text-app-muted">
                  <Num value={order.total} digits={2} suffix="₮" />
                </div>
              </div>
            </div>

            {/* No wrapping: each action takes an equal share of the row
                instead, so two of them are halves and three are thirds. */}
            {!open && (
              <div className="mt-2 flex gap-2">
                <Action onClick={() => setPending({ id: order.id, mode: "edit" })}>
                  <EditIcon /> Засах
                </Action>
                {!order.reversedBy && !order.reversalOf && (
                  <Action onClick={() => setPending({ id: order.id, mode: "reverse" })}>
                    <RefreshIcon size={14} /> Буцаах
                  </Action>
                )}
                <Action
                  danger
                  onClick={() => setPending({ id: order.id, mode: "delete" })}
                >
                  <TrashIcon size={14} /> Устгах
                </Action>
              </div>
            )}

            {open && pending.mode === "edit" && (
              <EditForm
                order={order}
                busy={busy === order.id}
                onCancel={() => setPending(null)}
                onSave={(patch) => setConfirmEdit({ id: order.id, patch })}
              />
            )}

            <ConfirmDialog
              open={open && pending.mode === "reverse"}
              title="Захиалгыг буцаах уу?"
              body={
                <>
                  Эсрэг захиалга нэмэгдэж, түүх хоёуланг нь харуулна. Мөнгө болон
                  хувьцааны үлдэгдэл захиалгын өмнөх байдалдаа эргэнэ.
                </>
              }
              detail={<OrderLine order={order} />}
              confirmLabel="Буцаах"
              busy={busy === order.id}
              onCancel={() => setPending(null)}
              onConfirm={() =>
                send(order.id, "/reverse", { method: "POST" }, "Захиалга буцаагдлаа")
              }
            />

            <ConfirmDialog
              open={open && pending.mode === "delete"}
              danger
              title="Захиалгыг бүрмөсөн устгах уу?"
              body={
                order.imported ? (
                  <>
                    Энэ мөрийг хуулга үүсгэсэн — дараагийн импорт үүнийг эргүүлж нэмнэ.
                    Мөр устаж, мөнгө болон хувьцааны үлдэгдэл сэргэнэ. Буцаах боломжгүй.
                  </>
                ) : (
                  <>
                    Мөр түүхээс бүрмөсөн арилж, мөнгө болон хувьцааны үлдэгдэл сэргэнэ.
                    Буцаах боломжгүй.
                  </>
                )
              }
              detail={<OrderLine order={order} />}
              confirmLabel="Устгах"
              busy={busy === order.id}
              onCancel={() => setPending(null)}
              onConfirm={() => send(order.id, "", { method: "DELETE" }, "Захиалга устлаа")}
            />
          </div>
        );
      })}

      {/* Once, outside the rows: only one edit can be waiting at a time, and
          it is the one dialog that has a before and an after to show. */}
      <ConfirmDialog
        open={confirmEdit !== null}
        title="Захиалгыг засах уу?"
        body={
          <>
            Мөнгө болон хувьцааны үлдэгдэл хуучин болон шинэ дүнгийн зөрүүгээр
            хөдөлнө.
          </>
        }
        detail={
          confirmEdit && (
            <EditSummary
              before={orders.find((o) => o.id === confirmEdit.id)!}
              after={confirmEdit.patch}
            />
          )
        }
        confirmLabel="Засах"
        busy={confirmEdit !== null && busy === confirmEdit.id}
        onCancel={() => setConfirmEdit(null)}
        onConfirm={() =>
          confirmEdit &&
          send(
            confirmEdit.id,
            "",
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(confirmEdit.patch),
            },
            "Захиалга зассан",
          )
        }
      />
    </div>
  );
}

/** The order a dialog is about, in the words the row uses for it. */
function OrderLine({ order }: { order: AdminOrderRow }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold">
        {order.symbol}{" "}
        <span
          className={order.side === "BUY" ? "text-app-positive" : "text-app-negative"}
        >
          {order.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
        </span>
      </span>
      <span className="text-right">
        <span className="block">
          {order.quantity} ш × <Num value={order.price} digits={2} suffix="₮" />
        </span>
        <span className="block text-xs text-app-muted">
          {ulaanbaatarDateTime(order.createdAt)}
        </span>
      </span>
    </div>
  );
}

/** What the edit changes, old against new, with the untouched fields dimmed. */
function EditSummary({
  before,
  after,
}: {
  before: AdminOrderRow;
  after: PendingEdit["patch"];
}) {
  const rows: [string, string, string][] = [
    ["Төрөл", side(before.side), side(after.side)],
    ["Тоо ширхэг", `${before.quantity} ш`, `${after.quantity} ш`],
    ["Үнэ", money(before.price), money(after.price)],
    ["Нийт", money(before.total), money(after.quantity * after.price)],
    ["Огноо", ulaanbaatarDateTime(before.createdAt), after.createdAt.replace("T", " ")],
  ];
  return (
    <dl className="space-y-1.5">
      {rows.map(([label, was, now]) => {
        const same = was === now;
        return (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-app-muted">{label}</dt>
            <dd className={same ? "text-app-muted" : "text-app-text"}>
              {same ? (
                now
              ) : (
                <>
                  <span className="text-app-muted line-through">{was}</span>{" "}
                  <span className="font-semibold">{now}</span>
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

const side = (value: "BUY" | "SELL") => (value === "BUY" ? "Авсан" : "Зарсан");
const money = (value: number) =>
  `${value.toLocaleString("mn-MN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₮`;

function EditForm({
  order,
  busy,
  onCancel,
  onSave,
}: {
  order: AdminOrderRow;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: PendingEdit["patch"]) => void;
}) {
  const [side, setSide] = useState(order.side);
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [price, setPrice] = useState(String(order.price));
  // The clock face in Ulaanbaatar, which is what the server reads it back as.
  const [at, setAt] = useState(ulaanbaatarStamp(new Date(order.createdAt)).slice(0, 16));

  const total = (Number(quantity) || 0) * (Number(price) || 0);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-app-border bg-app-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ side, quantity: Number(quantity), price: Number(price), createdAt: at });
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-app-muted">
          Төрөл
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}
            className={FIELD}
          >
            <option value="BUY">Авсан</option>
            <option value="SELL">Зарсан</option>
          </select>
        </label>
        <label className="text-xs text-app-muted">
          Тоо ширхэг
          <input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="text-xs text-app-muted">
          Үнэ
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="text-xs text-app-muted">
          Огноо (УБ)
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className={FIELD}
          />
        </label>
      </div>
      <p className="text-xs text-app-muted">
        Нийт дүн <Num value={total} digits={2} suffix="₮" className="text-app-text" /> — зөрүүгээр
        нь мөнгө болон хувьцааны үлдэгдэл засагдана.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Хадгалж байна…" : "Хадгалах"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-text"
        >
          Болих
        </button>
      </div>
    </form>
  );
}

const FIELD =
  "mt-1 w-full rounded-lg border border-app-border bg-app-card px-2 py-1.5 text-sm text-app-text";

/**
 * One of the row's actions, taking an equal share of the row's width.
 *
 * They were content-width chips before, which left them huddled at the left
 * of a row that is otherwise full-bleed, and gave each a tap target the size
 * of its own word — so Засах, the least destructive of the three, was also
 * the smallest thing to hit. An equal share puts them under the figures they
 * act on and makes them the same size as each other.
 */
function Action({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-app-border px-2.5 py-2 text-xs font-semibold ${
        danger ? "text-app-negative" : "text-app-text"
      }`}
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-app-bg px-2 py-0.5 text-[10px] font-bold text-app-muted">
      {children}
    </span>
  );
}
