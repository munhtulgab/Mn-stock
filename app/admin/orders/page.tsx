import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { listOrders } from "@/lib/adminUsers";
import { ulaanbaatarDateTime } from "@/lib/day";
import Num from "@/components/Num";
import PageHead from "@/components/admin/PageHead";
import { SearchIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Every order on the installation, newest first.
 *
 * The dashboard shows the last handful and this is where "and the rest" goes.
 * It is not the account pages seen sideways: those are one person's history,
 * with the corrections that act on it; this is the ledger, and the way from a
 * row here to the place it can be changed is the account it belongs to.
 *
 * Paged rather than capped, because a capped list quietly stops being the
 * ledger the moment there are more orders than the cap, and nothing on the
 * page says so.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; symbol?: string }>;
}) {
  const db = await getDb();
  await requireAdminPage(db);
  const params = await searchParams;
  const symbol = params.symbol?.trim().toUpperCase() || undefined;
  const wanted = Number(params.page);
  const page = Number.isInteger(wanted) && wanted > 0 ? wanted : 1;
  const list = await listOrders(db, { page, symbol });

  const href = (n: number) => {
    const query = new URLSearchParams();
    if (symbol) query.set("symbol", symbol);
    if (n > 1) query.set("page", String(n));
    const search = query.toString();
    return search ? `/admin/orders?${search}` : "/admin/orders";
  };

  return (
    <div className="space-y-5">
      <PageHead
        title="Захиалгууд"
        sub={
          symbol
            ? `${symbol} — ${list.total.toLocaleString("mn-MN")} захиалга`
            : `Нийт ${list.total.toLocaleString("mn-MN")} захиалга`
        }
      />

      <form className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted">
            <SearchIcon size={16} />
          </span>
          <input
            name="symbol"
            defaultValue={symbol ?? ""}
            placeholder="Хувьцааны богино нэрээр шүүх, ж.нь QPAY"
            className="w-full rounded-full border border-app-border bg-app-card py-2.5 pr-4 pl-9 text-sm text-app-text placeholder:text-app-muted"
          />
        </div>
        <button className="rounded-full border border-app-border bg-app-card px-5 py-2.5 text-sm font-semibold text-app-text hover:bg-app-elevated">
          Шүүх
        </button>
        {symbol && (
          <Link
            href="/admin/orders"
            className="flex items-center rounded-full border border-app-border bg-app-card px-5 py-2.5 text-sm font-semibold text-app-muted hover:bg-app-elevated"
          >
            Цэвэрлэх
          </Link>
        )}
      </form>

      {list.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-app-border p-8 text-center text-sm text-app-muted">
          {symbol ? `${symbol}-ийн захиалга олдсонгүй.` : "Захиалга алга."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card">
          <table className="hidden w-full border-collapse sm:table">
            <thead>
              <tr>
                <Th>Хэрэглэгч</Th>
                <Th>Хувьцаа</Th>
                <Th>Төрөл</Th>
                <Th right>Тоо</Th>
                <Th right>Үнэ</Th>
                <Th right>Дүн</Th>
                <Th right>Огноо</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((t) => (
                <tr key={t.id} className="rowlink border-b border-app-divider last:border-0">
                  <Td>
                    <Link
                      href={`/admin/users/${t.userId}`}
                      className="font-semibold text-app-text"
                    >
                      @{t.username}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/admin/orders?symbol=${t.symbol}`}
                        className="font-semibold text-app-text"
                      >
                        {t.symbol}
                      </Link>
                      {t.imported && <Tag>ХУУЛГА</Tag>}
                      {t.reversalOf && <Tag>БУЦААЛТ</Tag>}
                      {t.editedAt && <Tag>ЗАССАН</Tag>}
                    </span>
                  </Td>
                  <Td>
                    <SidePill side={t.side} />
                  </Td>
                  <Td right>{t.quantity.toLocaleString("mn-MN")}</Td>
                  <Td right>
                    <Num value={t.price} digits={2} suffix="₮" />
                  </Td>
                  <Td right>
                    <span className="font-semibold">
                      <Num value={t.total} digits={0} suffix="₮" />
                    </span>
                  </Td>
                  <Td right>
                    <span className="text-app-muted">
                      {ulaanbaatarDateTime(t.createdAt)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="divide-y divide-app-divider sm:hidden">
            {list.rows.map((t) => (
              <Link
                key={t.id}
                href={`/admin/users/${t.userId}`}
                className="rowlink flex items-center gap-3 px-5 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{t.symbol}</span>
                    <SidePill side={t.side} />
                    {t.imported && <Tag>ХУУЛГА</Tag>}
                    {t.reversalOf && <Tag>БУЦААЛТ</Tag>}
                  </span>
                  <span className="block truncate text-xs text-app-muted">
                    @{t.username} · {ulaanbaatarDateTime(t.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">
                    <Num value={t.total} digits={0} suffix="₮" />
                  </span>
                  <span className="block text-xs text-app-muted">{t.quantity} ш</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {list.pages > 1 && (
        <nav className="flex items-center justify-between gap-3">
          <Step href={href(list.page - 1)} disabled={list.page <= 1}>
            ← Өмнөх
          </Step>
          <span className="text-[13px] text-app-muted tabular-nums">
            {list.page} / {list.pages}
          </span>
          <Step href={href(list.page + 1)} disabled={list.page >= list.pages}>
            Дараах →
          </Step>
        </nav>
      )}
    </div>
  );
}

function Step({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const shell =
    "rounded-full border border-app-border px-5 py-2.5 text-sm font-semibold";
  // A dead end is shown as one rather than removed: a control that vanishes
  // moves the one beside it, and the pair stops being where it was.
  return disabled ? (
    <span className={`${shell} cursor-default text-app-muted opacity-45`}>{children}</span>
  ) : (
    <Link href={href} className={`${shell} bg-app-card text-app-text hover:bg-app-elevated`}>
      {children}
    </Link>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-app-divider px-5 pt-5 pb-3 text-[11px] font-medium text-app-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-5 py-3 text-[13px] ${right ? "text-right tabular-nums" : "text-left"}`}>
      {children}
    </td>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-bold text-app-muted">
      {children}
    </span>
  );
}

function SidePill({ side }: { side: "BUY" | "SELL" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        side === "BUY"
          ? "bg-app-positive-bg text-app-positive"
          : "bg-app-negative-bg text-app-negative"
      }`}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {side === "BUY" ? "АВСАН" : "ЗАРСАН"}
    </span>
  );
}
