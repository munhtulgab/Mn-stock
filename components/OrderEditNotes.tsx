import StockAvatar from "./StockAvatar";
import Num from "./Num";
import { ulaanbaatarDateTime } from "@/lib/day";
import { changesOf, type CashEdit, type OrderEdit } from "@/lib/orderEdits";

/**
 * Who corrected an order, when, and what they changed — under the order.
 *
 * Shared by the account holder's history and the administrator's, so the
 * two say the same thing about the same order. The administrator's also
 * names which administrator; the account holder is told an administrator
 * did it, which is what they need to know.
 */
export default function OrderEditNotes({
  edits,
  editedAt,
  showWho = false,
}: {
  /** This order's corrections, newest first. */
  edits: OrderEdit[];
  /**
   * The row's own mark. Orders corrected before corrections were written
   * down carry this and nothing else, and saying "edited" without the detail
   * still beats saying nothing.
   */
  editedAt?: Date | null;
  showWho?: boolean;
}) {
  const shown = edits.filter((edit) => edit.action !== "delete");
  if (shown.length === 0 && !editedAt) return null;

  return (
    <ul className="mt-2 space-y-1.5 rounded-xl border border-app-divider bg-app-elevated px-3 py-2 text-[11px] text-app-muted">
      {shown.length === 0 && editedAt && (
        <li>
          <Heading verb="зассан" at={editedAt} />
        </li>
      )}
      {shown.map((edit, i) => (
        <li key={`${edit.action}-${new Date(edit.at).getTime()}-${i}`}>
          <Heading
            verb={edit.action === "reverse" ? "буцаасан" : "зассан"}
            at={edit.at}
            who={showWho ? edit.by : undefined}
          />
          {edit.action === "edit" && edit.after && (
            <span className="mt-0.5 block">
              {changesOf(edit.before, edit.after, (at) => ulaanbaatarDateTime(at)).map(
                (change) => (
                  <span key={change.label} className="mr-3 inline-block whitespace-nowrap">
                    {change.label}:{" "}
                    <span className="line-through">{change.from}</span>
                    {" → "}
                    <span className="font-semibold text-app-text">{change.to}</span>
                  </span>
                ),
              )}
            </span>
          )}
          {edit.action === "reverse" && (
            <span className="mt-0.5 block">
              Эсрэг захиалгаар цуцалсан — мөнгө, хувьцаа өмнөх байдалдаа эргэсэн.
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Heading({ verb, at, who }: { verb: string; at: Date; who?: string }) {
  return (
    <span className="font-semibold text-app-text">
      Админ {verb}
      <span className="font-normal text-app-muted">
        {" · "}
        {ulaanbaatarDateTime(at)}
        {who ? ` · ${who}` : ""}
      </span>
    </span>
  );
}

/**
 * The label over a row an administrator put there, rather than the account
 * holder: on its own line at the top, so the row under it reads the way
 * every other row in the history does — what, and how much, then when.
 */
function AdminTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-bold tracking-wide text-app-muted">
      {children}
    </span>
  );
}

/**
 * An order an administrator deleted, standing where it used to.
 *
 * Struck through, because it no longer counts towards anything; kept,
 * because a history that silently loses a trade the reader remembers making
 * is a history they stop trusting.
 *
 * Laid out in lines rather than in two columns: the label, then the order
 * and its price, then its date and total, and then the note across the whole
 * row. Squeezed into the column beside the figures, the note — the sentence
 * that says the row counts for nothing — broke over three lines.
 */
export function DeletedOrderRow({
  edit,
  showWho = false,
  className = "px-4 py-3",
}: {
  edit: OrderEdit;
  showWho?: boolean;
  className?: string;
}) {
  const order = edit.before;
  return (
    <div className={`opacity-80 ${className}`}>
      <div className="flex items-start gap-3">
        <StockAvatar symbol={edit.symbol} />
        <div className="min-w-0 flex-1">
          <AdminTag>АДМИН УСТГАСАН</AdminTag>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-app-text line-through">
                {edit.symbol}
              </span>
              <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[11px] font-semibold text-app-muted">
                {order.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
              </span>
              <span className="rounded-full bg-app-negative-bg px-2 py-0.5 text-[10px] font-bold tracking-wide text-app-negative">
                УСТГАСАН
              </span>
            </div>
            <span className="shrink-0 text-right text-sm text-app-muted line-through">
              <span className="text-xs">{order.quantity} ш × </span>
              <Num value={order.price} digits={2} suffix="₮" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-app-muted">
            <span>{ulaanbaatarDateTime(order.createdAt)}</span>
            <span className="shrink-0 line-through">
              <Num value={order.total} digits={2} suffix="₮" />
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-app-muted">
        <span className="font-semibold text-app-text">Админ устгасан</span>
        {" · "}
        {ulaanbaatarDateTime(edit.at)}
        {showWho ? ` · ${edit.by}` : ""} — мөнгө, хувьцаанд тооцогдохгүй.
      </p>
    </div>
  );
}

/**
 * A cash balance an administrator set by hand, in the history with the
 * orders: the one change to the balance that no order explains.
 *
 * In the same lines as a deleted order: the label on top, then what changed
 * with the amount at the right, then when with the balance before and after
 * at the right. The label used to sit beside the title and dropped under it
 * whenever the amount took the room — so one row of this kind read one way
 * and the next another.
 */
export function CashEditRow({
  edit,
  showWho = false,
  className = "px-4 py-3",
}: {
  edit: CashEdit;
  showWho?: boolean;
  className?: string;
}) {
  const delta = edit.after - edit.before;
  const up = delta > 0;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-elevated text-base font-bold text-app-muted"
      >
        ₮
      </span>
      <div className="min-w-0 flex-1">
        <AdminTag>АДМИН ӨӨРЧИЛСӨН</AdminTag>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-semibold text-app-text">
            Мөнгөн үлдэгдэл
          </span>
          <span
            className="shrink-0 text-right text-sm"
            style={{ color: up ? "var(--app-positive)" : "var(--app-negative)" }}
          >
            <Num value={delta} digits={2} suffix="₮" showSign={up} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-app-muted">
          <span className="min-w-0 truncate">
            {ulaanbaatarDateTime(edit.at)}
            {showWho ? ` · ${edit.by}` : ""}
          </span>
          <span className="shrink-0 text-right">
            <span className="line-through">
              <Num value={edit.before} digits={2} suffix="₮" />
            </span>
            {" → "}
            <span className="text-app-text">
              <Num value={edit.after} digits={2} suffix="₮" />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
