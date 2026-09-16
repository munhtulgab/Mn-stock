"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Num from "@/components/Num";
import StockAvatar from "@/components/StockAvatar";
import { ulaanbaatarDateTime, ulaanbaatarStamp } from "@/lib/day";
import { EditIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Select, { type SelectOption } from "@/components/ui/Select";
import DateTimePicker from "@/components/ui/DateTimePicker";
import RowMenu, { type RowAction } from "@/components/admin/RowMenu";
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

  /**
   * Two lines on the way back, not one. All three of these move a balance,
   * and "Захиалга зассан" on its own does not say that anything was moved —
   * the second line is what tells the reader to expect the figures above to
   * have changed under them.
   */
  async function send(
    id: string,
    path: string,
    init: RequestInit,
    done: { title: string; body: string },
  ) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${userId}/orders/${id}${path}`, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Болсонгүй");
      toast({ ...done, variant: "success" });
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

  /**
   * The three corrections an order can take, as data rather than as markup.
   *
   * Both renderings — the row laid out in full and the ⋯ menu behind it —
   * read from this, so neither can quietly end up offering something the
   * other does not. Буцаах is absent on a row that has already been reversed
   * or that is itself a reversal: unwinding an unwinding is a knot, not a
   * correction.
   */
  function actionsFor(order: AdminOrderRow): RowAction[] {
    const undoable = !order.reversedBy && !order.reversalOf;
    return [
      {
        key: "edit",
        label: "Засах",
        icon: <EditIcon />,
        onSelect: () => setPending({ id: order.id, mode: "edit" }),
      },
      ...(undoable
        ? [
            {
              key: "reverse",
              label: "Буцаах",
              icon: <RefreshIcon size={16} />,
              onSelect: () => setPending({ id: order.id, mode: "reverse" }),
            },
          ]
        : []),
      {
        key: "delete",
        label: "Устгах",
        icon: <TrashIcon size={16} />,
        danger: true,
        onSelect: () => setPending({ id: order.id, mode: "delete" }),
      },
    ];
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
            {/* A container query, not a media one. What decides whether three
                labelled controls fit beside a ticker and a price is the width
                of this row, and that is not a function of the window: the
                ledger goes two columns at 1024 and halves the panel, so a
                laptop can have a narrower row than a wide phone held
                sideways. `@container` asks the row itself.

                From 32rem of row up the three are laid out in full. Below it
                they go behind a ⋯ — see `RowMenu`. A browser too old for
                container queries never matches `@lg` and gets the menu
                everywhere, which is the safe way round. */}
            <div className="@container flex items-center gap-x-3">
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

              {/* On the right of the row the figures are on, either way: laid
                  out in full where the row is wide enough, and behind one ⋯
                  where it is not. Named once, so the two cannot drift apart —
                  and so the menu is never missing the action the wide row
                  has. */}
              {!open && (
                <div className="flex shrink-0 items-stretch">
                  <div className="hidden items-stretch gap-1.5 @lg:flex">
                    {actionsFor(order).map((action) => (
                      <Action
                        key={action.key}
                        label={action.label}
                        danger={action.danger}
                        onClick={action.onSelect}
                      >
                        {action.icon}
                      </Action>
                    ))}
                  </div>
                  <RowMenu
                    className="@lg:hidden"
                    label={`${order.symbol} захиалгын үйлдэл`}
                    actions={actionsFor(order)}
                  />
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
                send(order.id, "/reverse", { method: "POST" }, {
                  title: "Захиалга буцаагдлаа",
                  body: "Үлдэгдэл өмнөх байдалдаа эргэлээ.",
                })
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
              onConfirm={() => send(order.id, "", { method: "DELETE" }, {
                title: "Захиалга устлаа",
                body: "Мөнгө болон хувьцааны үлдэгдэл сэргээгдлээ.",
              })}
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
            {
              title: "Захиалга зассан",
              body: "Мөнгө болон хувьцааны үлдэгдэл шинэчлэгдлээ.",
            },
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {/* The word sits beside the control rather than wrapping it: a
            `<label>` around a button is clicked twice by some browsers, and a
            dropdown that opens and shuts again is not a dropdown. */}
        <div className="min-w-0">
          <label htmlFor="edit-side" className="block text-xs text-app-muted">
            Төрөл
          </label>
          <div className="mt-1">
            <Select
              id="edit-side"
              label="Төрөл"
              value={side}
              options={SIDES}
              onChange={(value) => setSide(value as "BUY" | "SELL")}
            />
          </div>
        </div>
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
      </div>
      <div className="pt-1.5">
        <DateTimePicker id="edit-at" label="Огноо ба цаг (УБ)" value={at} onChange={setAt} />
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

/** The two an order can be, each with the direction it moves the account in. */
const SIDES: SelectOption[] = [
  { value: "BUY", label: "Авсан", icon: "arrowDown" },
  { value: "SELL", label: "Зарсан", icon: "arrowUp" },
];

/**
 * One of the row's actions where the row is wide enough to lay them out: the
 * mark above, the word under it. Narrower than that they go behind a ⋯ —
 * see `RowMenu`.
 *
 * Stacked rather than side by side because the row they sit on has the
 * company at one end and the figures at the other, and three chips laid out
 * lengthways take more of what is left than there is. Two lines of about
 * fifty pixels is the same information in a third of the width.
 *
 * The word stays. An icon-only row of three would be narrower still and
 * unreadable: a bin is obvious, a pencil is nearly obvious, and the circling
 * arrow that means "write the mirror of this trade" is a guess. These move
 * somebody's money — none of them should have to be guessed at. Where there
 * is no room for three words there is a menu, which has room for all three.
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
