"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * One poll per company, however many components want the price.
 *
 * The header quotes it and the trade buttons carry the two sides of the
 * book; both have to move together, and neither should be asking the server
 * on its own schedule. Subscribers share a single timer and a single answer,
 * which also means the trade ticket can never be priced from an older figure
 * than the one printed above it.
 *
 * Polling stops when the last subscriber leaves and pauses while the tab is
 * hidden, rather than waking a phone in a pocket every few seconds.
 */

export interface Quote {
  price: number | null;
  /** Most recent individual trade, which can sit away from the close. */
  lastTrade?: number | null;
  changePct: number | null;
  date: string | null;
  /** Exchange entry time, "HH:MM", when the quote is live. */
  at?: string | null;
  /** True while the exchange reports itself in session. */
  isLive?: boolean;
  /** Null when the exchange's status could not be read. */
  marketOpen?: boolean | null;
  /** Highest standing buy order; what a sale would fill at. */
  bid?: number | null;
  /** Lowest standing sell order; what a purchase would fill at. */
  ask?: number | null;
}

/**
 * The exchange's feed republishes about every two minutes, so this cannot
 * make the source fresher — it decides how long a new price sits at the
 * server before it reaches the screen. The request is a cached read.
 */
const POLL_MS = 10_000;

interface Stream {
  quote: Quote;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  onVisible: (() => void) | null;
}

const streams = new Map<string, Stream>();

async function refresh(symbol: string, stream: Stream): Promise<void> {
  if (document.visibilityState !== "visible") return;
  try {
    const res = await fetch(`/api/securities/${symbol}/quote`);
    if (!res.ok) return;
    const data: Quote = await res.json();
    // A reply with no price is a source that could not answer, not a price
    // of nothing; the previous figure stands.
    if (data.price === null) return;
    stream.quote = data;
    for (const listener of stream.listeners) listener();
  } catch {
    // A missed poll just leaves the previous figure in place.
  }
}

export function useLiveQuote(symbol: string, initial: Quote): Quote {
  // Held once, so a parent that re-renders with a fresh object literal does
  // not hand the store a new snapshot identity every time.
  const seed = useRef(initial);

  const subscribe = useCallback(
    (onChange: () => void) => {
      let stream = streams.get(symbol);
      if (!stream) {
        stream = {
          quote: seed.current,
          listeners: new Set(),
          timer: null,
          onVisible: null,
        };
        streams.set(symbol, stream);
      }
      const current = stream;
      const listener = () => onChange();
      current.listeners.add(listener);

      if (!current.timer) {
        const tick = () => refresh(symbol, current);
        current.timer = setInterval(tick, POLL_MS);
        current.onVisible = tick;
        document.addEventListener("visibilitychange", tick);
        tick();
      }

      return () => {
        current.listeners.delete(listener);
        if (current.listeners.size === 0) {
          if (current.timer) clearInterval(current.timer);
          if (current.onVisible) {
            document.removeEventListener("visibilitychange", current.onVisible);
          }
          streams.delete(symbol);
        }
      };
    },
    [symbol],
  );

  const snapshot = useCallback(
    () => streams.get(symbol)?.quote ?? seed.current,
    [symbol],
  );

  return useSyncExternalStore(subscribe, snapshot, () => seed.current);
}
