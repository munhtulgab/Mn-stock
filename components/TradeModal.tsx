"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import Num from "./Num";
import { useToast } from "./Toast";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from "./icons";
import type { OrderSide } from "@/lib/types";

export default function TradeModal({
  symbol,
  currentPrice,
  cashBalance,
  ownedQuantity,
}: {
  symbol: string;
  currentPrice: number | null;
  cashBalance: number;
  ownedQuantity: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<OrderSide | null>(null);
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Number(quantity) || 0;
  const total = currentPrice ? qty * currentPrice : 0;

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
        body: `${symbol} · ${qty} ширхэг · ${(body.price ?? currentPrice ?? 0).toLocaleString("mn-MN")}₮`,
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
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setOpen("SELL")}
          disabled={!currentPrice}
          className="flex items-center justify-center gap-2 rounded-2xl border border-app-negative/30 bg-app-negative-bg text-app-negative font-semibold py-3.5 text-sm disabled:opacity-50"
        >
          <ArrowDownIcon size={16} /> Зарах
        </button>
        <button
          onClick={() => setOpen("BUY")}
          disabled={!currentPrice}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand text-black font-semibold py-3.5 text-sm disabled:opacity-50"
        >
          <ArrowUpIcon size={16} /> Авах
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-app-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-app-text">
                  {symbol} {open === "BUY" ? "авах" : "зарах"}
                </h3>
                <button onClick={close} aria-label="Хаах" className="text-app-muted">
                  <CloseIcon />
                </button>
              </div>

              <div className="text-sm text-app-muted">
                Ханш:{" "}
                <span className="text-app-text">
                  {currentPrice ? <Num value={currentPrice} digits={2} suffix="₮" /> : "—"}
                </span>
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
