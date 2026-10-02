import StockAvatar from "./StockAvatar";
import Num from "./Num";
import OrderEditNotes, { CashEditRow, DeletedOrderRow } from "./OrderEditNotes";
import type { Transaction } from "@/lib/types";
import { editsByOrder, type CashEdit, type OrderEdit } from "@/lib/orderEdits";
import { ulaanbaatarDateTime } from "@/lib/day";

type Entry =
  | { kind: "order"; at: number; order: Transaction }
  | { kind: "deleted"; at: number; edit: OrderEdit }
  | { kind: "cash"; at: number; edit: CashEdit };

/**
 * Filled orders, newest first. Shared so the summary under the portfolio's
 * holdings and the full history page cannot drift apart.
 *
 * Given the account's corrections, each order an administrator changed says
 * so underneath, with what was changed, and an order they deleted keeps its
 * place struck through. Given the balance changes made by hand, those stand
 * among the orders at the time they were made. Without either it is the
 * plain list it always was.
 */
export default function TransactionList({
  transactions,
  edits = [],
  cashEdits = [],
}: {
  transactions: Transaction[];
  edits?: OrderEdit[];
  cashEdits?: CashEdit[];
}) {
  const byOrder = editsByOrder(edits);
  const reversed = new Set(
    transactions.map((t) => t.reversalOf).filter((id): id is string => Boolean(id)),
  );
  const entries: Entry[] = [
    ...transactions.map((order) => ({
      kind: "order" as const,
      at: new Date(order.createdAt).getTime(),
      order,
    })),
    ...edits
      .filter((edit) => edit.action === "delete")
      .map((edit) => ({
        kind: "deleted" as const,
        at: new Date(edit.before.createdAt).getTime(),
        edit,
      })),
    ...cashEdits.map((edit) => ({
      kind: "cash" as const,
      at: new Date(edit.at).getTime(),
      edit,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
      {entries.map((entry, i) => {
        if (entry.kind === "deleted") return <DeletedOrderRow key={`d${i}`} edit={entry.edit} />;
        if (entry.kind === "cash") return <CashEditRow key={`c${i}`} edit={entry.edit} />;
        const t = entry.order;
        const id = t._id ? String(t._id) : "";
        return (
          <div key={id || i} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <StockAvatar symbol={t.symbol} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-app-text text-sm">{t.symbol}</span>
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                      t.side === "BUY"
                        ? "bg-app-positive-bg text-app-positive"
                        : "bg-app-negative-bg text-app-negative"
                    }`}
                  >
                    {t.side === "BUY" ? "АВСАН" : "ЗАРСАН"}
                  </span>
                  {t.reversalOf && <Mark>БУЦААЛТ</Mark>}
                  {id && reversed.has(id) && <Mark>БУЦААГДСАН</Mark>}
                  {t.editedAt && !t.reversalOf && <Mark>ЗАССАН</Mark>}
                </div>
                <div className="text-xs text-app-muted">
                  {ulaanbaatarDateTime(t.createdAt)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm text-app-text">
                  <span className="text-app-muted text-xs">{t.quantity} ш × </span>
                  <Num value={t.price} digits={2} suffix="₮" />
                </div>
                <div className="text-xs text-app-muted">
                  <Num value={t.total} digits={2} suffix="₮" />
                </div>
              </div>
            </div>
            <OrderEditNotes edits={byOrder.get(id) ?? []} editedAt={t.reversalOf ? null : t.editedAt} />
          </div>
        );
      })}
    </div>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-bold tracking-wide text-app-muted">
      {children}
    </span>
  );
}
