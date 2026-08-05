"use client";

import { useEffect, useState } from "react";
import Num, { Pct } from "./Num";

interface Quote {
  price: number | null;
  changePct: number | null;
  date: string | null;
  /** False while the exchange has yet to publish today's session. */
  isToday: boolean;
}

/** How often to ask, while the page is actually being looked at. */
const POLL_MS = 60_000;

/**
 * The security's price, labelled with the trading day it belongs to.
 *
 * MSE publishes a session after it closes rather than tick by tick, so
 * during trading hours the newest figure available is the previous day's
 * close. Presenting that as the current price would misread the market, so
 * the day is always shown and a figure that isn't today's says so.
 *
 * Polling exists to catch the moment a new session is published, and pauses
 * with the tab hidden rather than waking a phone in someone's pocket.
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
      {quote.date && (
        <div className="text-[10px] text-app-muted mt-0.5">
          {quote.isToday ? "Өнөөдрийн хаалт" : `${quote.date}-ний хаалт`}
        </div>
      )}
    </div>
  );
}
