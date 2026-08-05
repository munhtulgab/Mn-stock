"use client";

import { useEffect, useState } from "react";
import Num, { Pct } from "./Num";

interface Profile {
  isin: string | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  closePrice: number | null;
  closeDate: string | null;
  classification: string | null;
  business: string | null;
}
interface PeriodChange {
  key: string;
  label: string;
  changePercent: number;
  date: string;
}
interface Dividend {
  year: number;
  amount: number;
  yieldPct: number | null;
}
interface BigOwner {
  name: string;
  shares: number;
  percent: number;
}
interface Slice {
  name: string;
  count: number;
  percent: number;
}
interface Data {
  /** False when marketinfo.mn carries nothing for this company. */
  available?: boolean;
  sourceUrl: string;
  profile: Profile;
  changes: PeriodChange[];
  dividends: Dividend[];
  bigOwners: BigOwner[];
  concentration: Slice[];
  domesticForeign: Slice[];
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: Data }
  | { kind: "none" };

/**
 * marketinfo.mn figures the exchange feed doesn't carry: market
 * capitalisation, shares in issue, dividend history and who owns the
 * company. Loaded client-side so a slow third party never delays the page.
 */
export default function MarketInfoPanel({ symbol }: { symbol: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [loadedFor, setLoadedFor] = useState(symbol);

  if (loadedFor !== symbol) {
    setLoadedFor(symbol);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/securities/${symbol}/marketinfo`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("unavailable"))))
      .then(
        (data: Data) =>
          !cancelled &&
          setState(
            data.available === false ? { kind: "none" } : { kind: "ready", data },
          ),
      )
      .catch(() => !cancelled && setState({ kind: "none" }));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Nothing to show beats an error box for an optional third-party source.
  if (state.kind === "none") return null;

  if (state.kind === "loading") {
    return (
      <div className="rounded-2xl border border-app-border bg-app-card p-4">
        <div className="h-4 w-40 rounded bg-app-bg animate-pulse mb-3" />
        <div className="h-20 rounded bg-app-bg animate-pulse" />
      </div>
    );
  }

  const { profile, changes, dividends, bigOwners, concentration, domesticForeign } =
    state.data;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app-text">Зах зээлийн үзүүлэлт</h2>
        <a
          href={state.data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-brand font-medium"
        >
          marketinfo.mn
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
        {profile.marketCap !== null && (
          <Row label="Зах зээлийн үнэлгээ">
            <Num value={profile.marketCap} digits={0} suffix="₮" />
          </Row>
        )}
        {profile.sharesOutstanding !== null && (
          <Row label="Гаргасан хувьцаа">
            <Num value={profile.sharesOutstanding} digits={0} />
          </Row>
        )}
        {profile.classification && (
          <Row label="Бүртгэлийн ангилал">{profile.classification}</Row>
        )}
        {profile.isin && <Row label="ISIN">{profile.isin}</Row>}
      </dl>

      {changes.length > 0 && (
        <div>
          <div className="text-xs font-medium text-app-text mb-2">
            Өөрчлөлт хөдөлгөөн
          </div>
          <div className="grid grid-cols-3 gap-2">
            {changes
              .filter((c) => c.key !== "last")
              .map((c) => (
                <div key={c.key} className="rounded-xl bg-app-bg px-2 py-1.5 text-center">
                  <div className="text-[10px] text-app-muted">{c.label}</div>
                  <div className="text-xs">
                    <Pct value={c.changePercent} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {dividends.length > 0 && (
        <div>
          <div className="text-xs font-medium text-app-text mb-2">Ноогдол ашиг</div>
          <ul className="space-y-1">
            {dividends.slice(0, 4).map((d, i) => (
              <li key={`${d.year}-${i}`} className="flex justify-between text-xs">
                <span className="text-app-muted">{d.year}</span>
                <span className="text-app-text tabular-nums">
                  <Num value={d.amount} digits={2} suffix="₮" />
                  {d.yieldPct !== null && (
                    <span className="text-app-muted"> · өгөөж {d.yieldPct}%</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(bigOwners.length > 0 || concentration.length > 0) && (
        <div>
          <div className="text-xs font-medium text-app-text mb-2">
            Хувьцаа эзэмшигчид
          </div>
          <ul className="space-y-1">
            {bigOwners.slice(0, 3).map((o) => (
              <li key={o.name} className="flex justify-between gap-2 text-xs">
                <span className="text-app-muted truncate">{o.name}</span>
                <span className="text-app-text tabular-nums shrink-0">
                  {o.percent}%
                </span>
              </li>
            ))}
          </ul>
          {[...concentration, ...domesticForeign].length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...concentration, ...domesticForeign].map((s) => (
                <span
                  key={s.name}
                  className="rounded-full bg-app-bg px-2 py-0.5 text-[10px] text-app-muted"
                >
                  {s.name} {s.percent}%
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-app-muted">{label}</dt>
      <dd className="text-right tabular-nums text-app-text">{children}</dd>
    </>
  );
}
