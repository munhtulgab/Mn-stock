"use client";

import Num, { Pct } from "./Num";
import { useLiveQuote, type Quote } from "./useLiveQuote";

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
        {quote.date && (
          <span>
            {quote.isLive ? "· " : ""}
            {quote.date}
            {quote.at && ` ${quote.at}`}
          </span>
        )}
      </div>
    </div>
  );
}
