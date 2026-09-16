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
      <p className="px-4 pb-4 text-sm text-app-muted">
        Энэ хэрэглэгч арилжаа хийгээгүй байна.
      </p>
    );
  }

  // No card of its own: the panel around it draws that, and two nested cards
  // read as a box inside a box.
  return (
    <div className="divide-y divide-app-divider border-t border-app-divider">
      {orders.map((order) => {
        const open = pending?.id === order.id;
        return (
          <div key={order.id} className="px-4 py-3" data-order={order.id}>
            {/* Wraps rather than squeezes. From about 560px of row up it is
                one line — the company, the figures, then the three actions
                hard against the right edge. Below that the actions drop to a
                line of their own and stay right-aligned, because three of
                them beside a price on a 390px phone would leave the ticker
                about twenty pixels to live in. `min-w` on the middle column
                is what makes the row wrap at all: without it that column
                shrinks to nothing and the symbol truncates away instead. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StockAvatar symbol={order.symbol} />
              <div className="min-w-[7.5rem] flex-1">
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

              {/* On the right of the row the figures are on, not on a band
                  under it. `ml-auto` is what holds them to the right edge on
                  the line they wrap onto. */}
              {!open && (
                <div className="ml-auto flex shrink-0 items-stretch gap-1.5">
                  <Action
                    label="Засах"
                    onClick={() => setPending({ id: order.id, mode: "edit" })}
                  >
                    <EditIcon />
                  </Action>
                  {!order.reversedBy && !order.reversalOf && (
                    <Action
                      label="Буцаах"
                      onClick={() => setPending({ id: order.id, mode: "reverse" })}
                    >
                      <RefreshIcon size={16} />
                    </Action>
                  )}
                  <Action
                    danger
                    label="Устгах"
                    onClick={() => setPending({ id: order.id, mode: "delete" })}
                  >
                    <TrashIcon size={16} />
                  </Action>
                </div>
              )}
            </div>

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
          style={{ color: "var(--on-brand)" }}
          className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold disabled:opacity-60"
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
 * One of the row's actions: the mark above, the word under it.
 *
 * Stacked rather than side by side because the row they now sit on has the
 * company at one end and the figures at the other, and three chips laid out
 * lengthways take more of what is left than there is. Two lines of about
 * fifty pixels is the same information in a third of the width.
 *
 * The word stays. An icon-only row of three would be narrower still and
 * unreadable: a bin is obvious, a pencil is nearly obvious, and the circling
 * arrow that means "write the mirror of this trade" is a guess. These move
 * somebody's money — none of them should have to be guessed at.
 *
 * All three the same width, set rather than sized to their own labels, so
 * Засах is as big a target as Устгах. The least destructive of the three
 * should not be the hardest to hit.
 */
function Action({
  children,
  label,
  onClick,
  danger,
}: {
  /** The mark, at 16px. */
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-[3.25rem] flex-col items-center justify-center gap-1 rounded-lg border border-app-border py-1.5 text-[10px] leading-none font-semibold ${
        danger ? "text-app-negative" : "text-app-text"
      } hover:bg-app-elevated`}
    >
      {children}
      {label}
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
