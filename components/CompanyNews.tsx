"use client";

import { useEffect, useState } from "react";

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

/**
 * Renders a timestamp without going through Date. The sources state
 * Ulaanbaatar local time, and parsing would re-interpret it in whatever
 * zone the reader's device is set to.
 */
function formatWhen(date: string): string {
  if (!date) return "";
  const day = date.slice(0, 10);
  const time = date.slice(11, 16);
  return time ? `${day} ${time}` : day;
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
      source: "МХБ",
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

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <h2 className="text-sm font-semibold text-app-text mb-3">
        {symbol}-тай холбоотой мэдээ
      </h2>

      {state.kind === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-app-bg animate-pulse" />
          ))}
        </div>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-app-muted">Мэдээ ачаалахад алдаа гарлаа.</p>
      )}

      {state.kind === "ready" && state.items.length === 0 && (
        <p className="text-xs text-app-muted">
          Энэ компанитай холбоотой мэдээ олдсонгүй.
        </p>
      )}

      {state.kind === "ready" && state.items.length > 0 && (
        <ul className="space-y-2.5">
          {state.items.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block active:opacity-70"
              >
                <div className="text-xs text-app-text leading-snug">
                  {item.title}
                </div>
                <div className="text-[11px] text-app-muted mt-0.5">
                  {item.source}
                  {item.date && ` · ${formatWhen(item.date)}`}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
