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
  /** The same entry time in full, e.g. 2026-08-06T10:55:12+08:00. */
  atIso?: string | null;
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
 * How often the open page asks for a new figure.
 *
 * Five seconds while the exchange is trading, which is exactly how long the
 * server holds a quote — so every ask can return something new and none of
 * them can hit the feed twice for the same second. Asking every second would
 * not make the price fresher: the source itself republishes about every two
 * minutes, and the age shown beside the price ticks every second regardless.
 *
 * Once the session is shut the figures are final, so the page stops asking
 * in earnest and just checks now and then in case it reopens.
 */
const LIVE_POLL_MS = 5_000;
const CLOSED_POLL_MS = 60_000;

interface Stream {
  quote: Quote;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  /** The interval the timer is running at, so a change of session can move it. */
  cadence: number | null;
  onVisible: (() => void) | null;
}

/** Runs the poll at the cadence the current session calls for. */
function schedule(symbol: string, stream: Stream): void {
  const wanted = stream.quote.isLive === false ? CLOSED_POLL_MS : LIVE_POLL_MS;
  if (stream.timer && stream.cadence === wanted) return;
  if (stream.timer) clearInterval(stream.timer);
  stream.cadence = wanted;
  stream.timer = setInterval(() => refresh(symbol, stream), wanted);
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
    // A session that has just opened or shut changes how often to ask.
    schedule(symbol, stream);
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
          cadence: null,
          onVisible: null,
        };
        streams.set(symbol, stream);
      }
      const current = stream;
      const listener = () => onChange();
      current.listeners.add(listener);

      if (!current.timer) {
        const tick = () => refresh(symbol, current);
        schedule(symbol, current);
        current.onVisible = tick;
        document.addEventListener("visibilitychange", tick);
        tick();
      }

      return () => {
        current.listeners.delete(listener);
        if (current.listeners.size === 0) {
          if (current.timer) clearInterval(current.timer);
          current.timer = null;
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
