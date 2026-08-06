"use client";

import { useEffect, useState } from "react";
import Num, { Pct } from "./Num";
import { useLiveQuote, type Quote } from "./useLiveQuote";

/**
 * How long ago the exchange wrote this entry, counted here rather than
 * fetched.
 *
 * The source republishes about every two minutes, so asking it every second
 * would return the same figure sixty times over. What can honestly move
 * every second is how old the figure is — and that is also the thing worth
 * knowing about a price labelled "Шууд".
 */
function useAge(atIso: string | null | undefined): string | null {
  // A clock rather than a stored age: the tick moves this on, and the entry
  // it is measured against comes straight from the quote.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const entry = atIso ? Date.parse(atIso) : NaN;
  if (Number.isNaN(entry)) return null;
  // Zero until the first tick, which is also what the server rendered.
  const seconds = now === 0 ? 0 : Math.max(0, Math.round((now - entry) / 1000));
  if (seconds < 60) return `${seconds}с`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}м ${seconds % 60}с` : null;
}

/**
 * The security's price, labelled with where and when it came from.
 *
 * During a session marketinfo carries the live book, so the figure moves and
 * is stamped with the exchange's entry time. Outside one, or if that source
 * is unreachable, the newest published close stands in and says which day it
 * belongs to — the exchange publishes a session only after it ends, and a
 * stale close shown unlabelled would misread the market.
 *
 * The polling itself is shared with the trade buttons, which quote the two
 * sides of the same book — see {@link useLiveQuote}.
 */
export default function LivePrice({
  symbol,
  initial,
}: {
  symbol: string;
  initial: Quote;
}) {
  const quote = useLiveQuote(symbol, initial);
  const age = useAge(quote.isLive ? quote.atIso : null);

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
      {quote.isLive && quote.lastTrade != null && quote.lastTrade !== quote.price && (
        <div className="text-[10px] text-app-muted">
          сүүлийн хэлцэл <Num value={quote.lastTrade} digits={2} suffix="₮" />
        </div>
      )}
      <div className="text-[10px] text-app-muted mt-0.5 flex items-center justify-end gap-1">
        {quote.isLive && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-app-positive" />
          </span>
        )}
        {quote.isLive && <span className="text-app-positive font-medium">Шууд</span>}
        {/* Always the full stamp: "12:57" alone leaves which day it was to
            guesswork, and outside a session that is the whole question. */}
        {/* In session the day is today by definition, so the stamp is the
            time and how long ago it was written — which ticks every second,
            the only thing here that honestly can, since the exchange itself
            republishes about every two minutes. Outside a session the date
            is the whole question and is always shown. */}
        {quote.isLive ? (
          <span className="tabular-nums whitespace-nowrap">
            · {quote.at}
            {age && ` · ${age}`}
          </span>
        ) : (
          quote.date && (
            <span className="whitespace-nowrap">
              {quote.date}
              {quote.at && ` ${quote.at}`}
            </span>
          )
        )}
      </div>
    </div>
  );
}
