"use client";

import { useEffect, useState } from "react";
import Num, { Pct } from "./Num";

interface Quote {
  price: number | null;
  changePct: number | null;
  date: string | null;
  /** Exchange entry time, "HH:MM", when the quote is live. */
  at?: string | null;
  /** True while marketinfo's order book is answering for the open session. */
  isLive?: boolean;
}

/** Fast enough to feel current, slow enough not to hammer a third party. */
const POLL_MS = 30_000;

/**
 * The security's price, labelled with where and when it came from.
 *
 * During a session marketinfo carries the live book, so the figure moves and
 * is stamped with the exchange's entry time. Outside one, or if that source
 * is unreachable, the newest published close stands in and says which day it
 * belongs to — the exchange publishes a session only after it ends, and a
 * stale close shown unlabelled would misread the market.
 *
 * Polling pauses with the tab hidden rather than waking a phone in a pocket.
 */
export default function LivePrice({
  symbol,
  initial,
}: {
  symbol: string;
  initial: Quote;
}) {
  const [quote, setQuote] = useState<Quote>(initial);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/securities/${symbol}/quote`);
        if (!res.ok) return;
        const data: Quote = await res.json();
        if (!cancelled && data.price !== null) setQuote(data);
      } catch {
        // A missed poll just leaves the previous figure in place.
      }
    }

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [symbol]);

  return (
    <div className="text-right">
      <div className="text-2xl text-app-text">
        {quote.price === null ? (
          <span className="text-app-muted">—</span>
        ) : (
          <Num value={quote.price} digits={2} suffix="₮" />
        )}
      </div>
      <div className="text-sm">
        <Pct value={quote.changePct} />
      </div>
      <div className="text-[10px] text-app-muted mt-0.5 flex items-center justify-end gap-1">
        {quote.isLive ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-app-positive" />
            </span>
            <span className="text-app-positive font-medium">Шууд</span>
            {quote.at && <span>· {quote.at}</span>}
          </>
        ) : (
          quote.date && <span>{quote.date}-ний хаалт</span>
        )}
      </div>
    </div>
  );
}
