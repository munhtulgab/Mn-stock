"use client";

import { useState } from "react";
import Num from "@/components/Num";
import StockAvatar from "@/components/StockAvatar";
import Panel from "@/components/admin/Panel";
import AdminOrderRows from "@/components/admin/AdminOrderRows";
import type { AdminUserDetail } from "@/lib/adminUsers";

/**
 * What the account holds, and what it did to get there — side by side.
 *
 * The two answer each other. A position is the sum of the orders that built
 * it, and the question asked of a holding that looks wrong is always the same
 * one: which trades made this? So picking a holding filters the history
 * beside it to that company, and the pair sits at equal width because neither
 * is the other's footnote.
 *
 * Picking the same holding again clears the filter, and so does Бүгд. There
 * is no "select nothing" row: the cleared state is the default, and a list
 * whose first item means "no item" is a list with a lie at the top of it.
 *
 * The filter lives here rather than in the URL. It is a way of reading one
 * page, not a place — and it survives none of the corrections below it, which
 * refresh the route.
 */
export default function AdminAccountLedger({ user }: { user: AdminUserDetail }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const orders = symbol ? user.orders.filter((o) => o.symbol === symbol) : user.orders;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {/* Pinned while the history scrolls. Somebody's whole order history is
          several screens tall, and a filter you have to scroll back up to
          change is a filter that gets used once. */}
      <div className="lg:sticky lg:top-4">
        <Panel
          title="Эзэмшиж буй хувьцаа"
          note={
            user.holdings.length > 0
              ? symbol
                ? "шүүлт идэвхтэй"
                : `${user.holdings.length}`
              : undefined
          }
          flush
        >
          {user.holdings.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-app-muted">Хувьцаа эзэмшээгүй байна.</p>
          ) : (
            <div className="divide-y divide-app-divider border-t border-app-divider">
              {user.holdings.map((h) => {
                const on = symbol === h.symbol;
                const up = h.gainLoss > 0;
                const down = h.gainLoss < 0;
                return (
                  <button
                    key={h.companyCode}
                    type="button"
                    onClick={() => setSymbol(on ? null : h.symbol)}
                    aria-pressed={on}
                    title={`${h.symbol}-ийн захиалгын түүхийг харах`}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-app-elevated"
                    style={on ? { backgroundColor: "var(--brand-light)" } : undefined}
                  >
                    <StockAvatar symbol={h.symbol} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-app-text">
                        {h.symbol}
                      </span>
                      <span className="block truncate text-[11px] text-app-muted">
                        {h.quantity.toLocaleString("mn-MN")} ш · өртөг{" "}
                        <Num value={h.avgCost} digits={2} suffix="₮" />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-app-text">
                        <Num value={h.marketValue} digits={0} suffix="₮" />
                      </span>
                      <span
                        className="block text-[11px] font-semibold tabular-nums"
                        style={{
                          color: up
                            ? "var(--app-positive)"
                            : down
                              ? "var(--app-negative)"
                              : "var(--app-muted)",
                        }}
                      >
                        {up && "+"}
                        <Num value={h.gainLoss} digits={0} suffix="₮" />
                        {h.gainLossPct !== null && (
                          <span className="font-normal">
                            {" "}
                            ({up && "+"}
                            {h.gainLossPct.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Захиалгын түүх"
        note={
          symbol ? (
            <button
              type="button"
              onClick={() => setSymbol(null)}
              className="font-semibold text-brand"
            >
              Бүгд →
            </button>
          ) : (
            `${user.orders.length} бичлэг`
          )
        }
        flush
      >
        <p className="px-5 pb-4 text-[13px] text-app-muted">
          {symbol ? (
            <>
              <span className="font-semibold text-app-text">{symbol}</span> — {orders.length}{" "}
              бичлэг. Засах, буцаах, устгах бүр мөнгөн үлдэгдэл болон хувьцааны тоог
              зөрүүгээр нь хамт хөдөлгөнө.
            </>
          ) : (
            <>
              Засах, буцаах, устгах бүр мөнгөн үлдэгдэл болон хувьцааны тоог зөрүүгээр нь
              хамт хөдөлгөнө. Хувьцаа дээр дарж түүхийг шүүнэ.
            </>
          )}
        </p>
        {symbol && orders.length === 0 ? (
          <p className="border-t border-app-divider px-5 py-4 text-sm text-app-muted">
            {symbol}-ийн захиалга бүртгэгдээгүй байна.
          </p>
        ) : (
          <AdminOrderRows userId={user.id} orders={orders} />
        )}
      </Panel>
    </div>
  );
}
