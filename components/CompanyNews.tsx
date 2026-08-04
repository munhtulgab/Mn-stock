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
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; mse: MseItem[]; external: ExternalItem[] }
  | { kind: "error" };

/**
 * Loads over the wire rather than during the page render: the MSE profile
 * scrape plus any configured news sites can take several seconds, and the
 * price/chart above shouldn't wait on it.
 */
export default function CompanyNews({ symbol }: { symbol: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    fetch(`/api/securities/${symbol}/news`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (cancelled) return;
        setState({
          kind: "ready",
          mse: Array.isArray(data.mse) ? data.mse : [],
          external: Array.isArray(data.external) ? data.external : [],
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

      {state.kind === "ready" && (
        <>
          {state.mse.length === 0 && state.external.length === 0 && (
            <p className="text-xs text-app-muted">
              Энэ компанитай холбоотой мэдээ олдсонгүй.
            </p>
          )}

          {state.mse.length > 0 && (
            <ul className="space-y-2.5">
              {state.mse.map((item) => (
                <li key={item.url + item.date}>
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
                      МХБ · {item.date.slice(0, 10)}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {state.external.length > 0 && (
            <div className={state.mse.length > 0 ? "mt-4 pt-3 border-t border-app-border" : ""}>
              <div className="text-[11px] text-app-muted mb-2">
                Мэдээллийн сайтуудаас
              </div>
              <ul className="space-y-2.5">
                {state.external.map((item) => (
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
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
