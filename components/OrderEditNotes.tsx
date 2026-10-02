import StockAvatar from "./StockAvatar";
import Num from "./Num";
import { ulaanbaatarDateTime } from "@/lib/day";
import { changesOf, type OrderEdit } from "@/lib/orderEdits";

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
 * An order an administrator deleted, standing where it used to.
 *
 * Struck through, because it no longer counts towards anything; kept,
 * because a history that silently loses a trade the reader remembers making
 * is a history they stop trusting.
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
    <div className={`flex items-start gap-3 opacity-80 ${className}`}>
      <StockAvatar symbol={edit.symbol} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-app-text line-through">{edit.symbol}</span>
          <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[11px] font-semibold text-app-muted">
            {order.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
          </span>
          <span className="rounded-full bg-app-negative-bg px-2 py-0.5 text-[10px] font-bold tracking-wide text-app-negative">
            УСТГАСАН
          </span>
        </div>
        <div className="text-xs text-app-muted">{ulaanbaatarDateTime(order.createdAt)}</div>
        <div className="mt-1 text-[11px] text-app-muted">
          <span className="font-semibold text-app-text">Админ устгасан</span>
          {" · "}
          {ulaanbaatarDateTime(edit.at)}
          {showWho ? ` · ${edit.by}` : ""} — мөнгө, хувьцаанд тооцогдохгүй.
        </div>
      </div>
      <div className="shrink-0 text-right text-app-muted line-through">
        <div className="text-sm">
          <span className="text-xs">{order.quantity} ш × </span>
          <Num value={order.price} digits={2} suffix="₮" />
        </div>
        <div className="text-xs">
          <Num value={order.total} digits={2} suffix="₮" />
        </div>
      </div>
    </div>
  );
}
