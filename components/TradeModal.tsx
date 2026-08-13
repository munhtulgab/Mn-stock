"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import Num from "./Num";
import { useToast } from "./Toast";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "./icons";
import { useLiveQuote, type Quote } from "./useLiveQuote";
import type { OrderSide } from "@/lib/types";

/**
 * The book as two rows: a price and the shares standing behind it.
 *
 * The feed publishes totals per side rather than the ladder — every buy order
 * counted together, not a row per price — so this is how deep each side is
 * rather than where. That is still what decides whether an order fills: a
 * best offer of 348.98 with nine hundred shares behind it and one with nine
 * are the same price and not the same market.
 *
 * The side this order would fill against is marked, because the two rows are
 * otherwise symmetrical and the one that matters depends on which button was
 * pressed. Shown on both buy and sell: a seller wants to see what is bid, and
 * also what the queue they are joining looks like.
 */
function OrderBook({ quote, side }: { quote: Quote; side: OrderSide }) {
  const rows = [
    {
      label: "Авах",
      price: quote.bid ?? null,
      qty: quote.bidQty ?? null,
      average: quote.bidVwap ?? null,
      tone: "text-app-positive",
      /** A sale fills against the bids. */
      fills: side === "SELL",
    },
    {
      label: "Зарах",
      price: quote.ask ?? null,
      qty: quote.askQty ?? null,
      average: quote.askVwap ?? null,
      tone: "text-app-negative",
      fills: side === "BUY",
    },
  ];

  // The movers board and Datalab both stand in for marketinfo when it is
  // down, and neither publishes a book. Nothing to show is not a row of
  // dashes; it is no panel.
  if (rows.every((row) => row.price === null && row.qty === null)) return null;

  return (
    <div className="rounded-2xl bg-app-bg p-3">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
        <span className="text-app-muted">Захиалгын сан</span>
        <span className="text-app-muted text-right">Үнэ</span>
        <span className="text-app-muted text-right">Ширхэг</span>

        {rows.map((row) => (
          <Fragment key={row.label}>
            <span className={row.fills ? "text-app-text font-medium" : "text-app-muted"}>
              {row.label}
              {row.fills && <span className="text-app-muted"> · энэ талд биелнэ</span>}
            </span>
            <span className={`text-right font-medium ${row.tone}`}>
              {row.price !== null ? <Num value={row.price} digits={2} /> : "—"}
            </span>
            <span className="text-right text-app-text">
              {row.qty !== null ? <Num value={row.qty} digits={0} /> : "—"}
            </span>
          </Fragment>
        ))}
      </div>

      {rows.some((row) => row.average !== null) && (
        <div className="mt-2 flex justify-between border-t border-app-border pt-2 text-[10px] text-app-muted">
          <span>Захиалгын дундаж үнэ</span>
          <span className="tabular-nums">
            {rows[0].average !== null ? <Num value={rows[0].average} digits={2} /> : "—"}
            {" / "}
            {rows[1].average !== null ? <Num value={rows[1].average} digits={2} /> : "—"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * An order fills against the book, not against the last price: buying takes
 * the lowest price anyone is offering, selling hits the highest anyone is
 * bidding. Both sides are shown, and the one this order would fill at is the
 * one the total is worked out from — the server prices it the same way.
 */
export default function TradeModal({
  symbol,
  initial,
  cashBalance,
  ownedQuantity,
}: {
  symbol: string;
  /** Rendered figures, kept current by the shared poll. */
  initial: Quote;
  cashBalance: number;
  ownedQuantity: number;
}) {
  const quote = useLiveQuote(symbol, initial);
  const currentPrice = quote.price;
  const bid = quote.bid ?? null;
  const ask = quote.ask ?? null;
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<OrderSide | null>(null);
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Number(quantity) || 0;
  const fillPrice =
    (open === "BUY" ? (ask ?? currentPrice) : (bid ?? currentPrice)) ?? null;
  const total = fillPrice ? qty * fillPrice : 0;

  function close() {
    setOpen(null);
    setQuantity("");
    setError(null);
  }

  async function submit() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/${open === "BUY" ? "buy" : "sell"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, quantity: qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Алдаа гарлаа");
        return;
      }
      const filled = open;
      close();
      toast({
        variant: "success",
        title: filled === "BUY" ? "Худалдан авалт хийгдлээ" : "Зарлаа",
        body: `${symbol} · ${qty} ширхэг · ${(body.price ?? fillPrice ?? 0).toLocaleString("mn-MN")}₮`,
        action: { label: "Багц", onClick: () => router.push("/portfolio") },
      });
      router.refresh();
    } catch {
      setError("Сүлжээний алдаа гарлаа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Each side carries the price it would fill at, so the decision does
          not need the ticket to be opened first. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setOpen("SELL")}
          disabled={!currentPrice}
          className="flex flex-col items-center justify-center rounded-2xl border border-app-negative/30 bg-app-negative-bg text-app-negative font-semibold py-2.5 text-sm leading-tight disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <ArrowDownIcon size={16} /> Зарах
          </span>
          <span className="text-xs font-bold tabular-nums">
            {bid ?? currentPrice ? (
              <Num value={(bid ?? currentPrice)!} digits={2} suffix="₮" />
            ) : (
              "—"
            )}
          </span>
        </button>
        <button
          onClick={() => setOpen("BUY")}
          disabled={!currentPrice}
          className="flex flex-col items-center justify-center rounded-2xl bg-brand text-black font-semibold py-2.5 text-sm leading-tight disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <ArrowUpIcon size={16} /> Авах
          </span>
          <span className="text-xs font-bold tabular-nums">
            {ask ?? currentPrice ? (
              <Num value={(ask ?? currentPrice)!} digits={2} suffix="₮" />
            ) : (
              "—"
            )}
          </span>
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-app-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-app-text">
                  {symbol} {open === "BUY" ? "авах" : "зарах"}
                </h3>
                <button onClick={close} aria-label="Хаах" className="text-app-muted">
                  <CloseIcon />
                </button>
              </div>

              <div className="rounded-2xl bg-app-bg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-app-muted">
                    {open === "BUY" ? "Захиалгын сангийн зарах" : "Захиалгын сангийн авах"}
                  </span>
                  <span className="text-app-text font-semibold">
                    {fillPrice ? <Num value={fillPrice} digits={2} suffix="₮" /> : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-app-muted">
                  <span>
                    Авах{" "}
                    <span className="text-app-positive font-medium">
                      {bid ? <Num value={bid} digits={2} /> : "—"}
                    </span>
                  </span>
                  <span>
                    Зарах{" "}
                    <span className="text-app-negative font-medium">
                      {ask ? <Num value={ask} digits={2} /> : "—"}
                    </span>
                  </span>
                  <span>
                    Сүүлийн{" "}
                    <span className="text-app-text">
                      {currentPrice ? <Num value={currentPrice} digits={2} /> : "—"}
                    </span>
                  </span>
                </div>
              </div>

              {open === "BUY" ? (
                <div className="text-xs text-app-muted">
                  Бэлэн мөнгө: <span className="text-app-text"><Num value={cashBalance} digits={2} suffix="₮" /></span>
                </div>
              ) : (
                <div className="text-xs text-app-muted">
                  Эзэмшиж буй: <span className="text-app-text font-medium">{ownedQuantity} ширхэг</span>
                </div>
              )}

              <OrderBook quote={quote} side={open} />

              <div>
                <label className="text-xs text-app-muted mb-1 block">Тоо ширхэг</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-3 text-app-text text-lg font-semibold outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-app-muted">Нийт дүн</span>
                <span className="text-app-text text-base"><Num value={total} digits={2} suffix="₮" /></span>
              </div>

              {error && (
                <div className="text-xs text-app-negative bg-app-negative-bg rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={busy || qty <= 0}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-sm disabled:opacity-50 ${
                  open === "BUY" ? "bg-brand text-black" : "bg-app-negative text-white"
                }`}
              >
                {open === "BUY" ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
                {busy ? "Илгээж байна..." : open === "BUY" ? "Худалдаж авах" : "Зарах"}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
