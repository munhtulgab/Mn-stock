"use client";

import { useEffect, useRef, useState } from "react";
import NewsList from "./NewsList";

interface MseItem {
  title: string;
  date: string;
  url: string;
}

interface ExternalItem {
  title: string;
  url: string;
  source: string;
  date?: string;
}

/** One news list, whichever publisher an item came from. */
interface Item {
  title: string;
  url: string;
  /** Local `YYYY-MM-DD[THH:MM:SS]`, or "" when the source states none. */
  date: string;
  source: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: Item[] }
  | { kind: "error" };

/**
 * Merges the exchange's own notices with matching headlines from the
 * configured news sites into a single dated list, newest first.
 *
 * Keeping them apart put every MSE notice above every news story regardless
 * of age, so a filing from two years ago sat over this morning's coverage.
 * Items whose source states no date sort last rather than claiming a
 * position they cannot support.
 */
function merge(mse: MseItem[], external: ExternalItem[]): Item[] {
  const items: Item[] = [
    ...mse.map((m) => ({
      title: m.title,
      url: m.url,
      date: m.date ?? "",
      source: "mse.mn",
    })),
    ...external.map((e) => ({
      title: e.title,
      url: e.url,
      date: e.date ?? "",
      source: e.source,
    })),
  ];

  return items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

/**
 * Loads over the wire rather than during the page render: the MSE profile
 * scrape plus any configured news sites can take several seconds, and the
 * price/chart above shouldn't wait on it.
 */
export default function CompanyNews({ symbol }: { symbol: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadedFor, setLoadedFor] = useState(symbol);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Navigating between two /stock/[symbol] pages reuses this instance, so the
  // previous company's news has to be cleared as the prop changes rather than
  // on mount — otherwise it shows under the new symbol until the fetch lands.
  if (loadedFor !== symbol) {
    setLoadedFor(symbol);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/securities/${symbol}/news`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          items: merge(
            Array.isArray(data.mse) ? data.mse : [],
            Array.isArray(data.external) ? data.external : [],
          ),
        });
      })
      .catch(() => !cancelled && setState({ kind: "error" }));

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Is anything hidden? Answered by the observer's own first callback rather
  // than by measuring here: a measurement taken during the effect would be of
  // a layout the browser has not done yet, and setting state from inside an
  // effect body is the thing that makes a render impure.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = new ResizeObserver(() =>
      setClipped(el.scrollHeight > el.clientHeight + 1),
    );
    measure.observe(el);
    return () => measure.disconnect();
  }, [state, expanded]);

  // No card of its own: NewsList draws one, and nesting them boxes every
  // headline twice. A heading over the list matches the market feed.
  //
  // On the board the list sits beside a column of three short panels and runs
  // a long way past the foot of them, which leaves the page lopsided. So it
  // is cut to their height and the rest opens on a tap.
  //
  // The cut is the grid's own doing rather than a measured pixel count: the
  // row is as tall as the panels opposite, this fills it, and the list is
  // taken out of flow inside it — so the list is clipped to whatever that
  // height turns out to be and nothing here has to know what it is.
  return (
    <section className={expanded ? undefined : "md:relative md:h-full"}>
      <div
        ref={box}
        className={expanded ? undefined : "md:absolute md:inset-0 md:overflow-hidden"}
      >
        <h2 className="text-sm font-semibold text-app-text mb-3">
          {symbol}-тай холбоотой мэдээ
        </h2>

      {state.kind === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-app-card animate-pulse" />
          ))}
        </div>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-app-muted">Мэдээ ачаалахад алдаа гарлаа.</p>
      )}

      {state.kind === "ready" && state.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-app-border p-5 text-center text-xs text-app-muted">
          Энэ компанитай холбоотой мэдээ олдсонгүй.
        </div>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <NewsList items={state.items} />
      )}
      </div>

      {/* Only on the board, and only when something is actually hidden. */}
      {clipped && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="hidden md:flex absolute inset-x-0 bottom-0 items-end justify-center pb-3 pt-10 text-xs font-semibold text-brand bg-linear-to-t from-app-bg via-app-bg to-transparent"
        >
          Бүх мэдээг харах
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="hidden md:block w-full pt-3 text-xs font-semibold text-brand"
        >
          Хураах
        </button>
      )}
    </section>
  );
}
