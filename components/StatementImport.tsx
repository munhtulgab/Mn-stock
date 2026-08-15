"use client";

import { useState } from "react";
import Num from "@/components/Num";
import { AlertIcon, CheckIcon, DownloadIcon } from "@/components/icons";

interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  cost: number;
}

interface Result {
  ok: boolean;
  dryRun?: boolean;
  positions: Position[];
  costBasis: number;
  fills: number;
  fees: number;
  closed: string[];
  excluded: string[];
  cash: number;
}

/**
 * Loads the stored broker statement into this account's portfolio.
 *
 * Two buttons rather than one, because the safe half of this is worth having
 * on its own: the first shows what would be written and writes nothing, and
 * only the second replaces what is there. Importing is not additive — it
 * clears the paper positions the app opened with — so it is worth seeing the
 * list before agreeing to it.
 */
export default function StatementImport() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    try {
      const res = await fetch("/api/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, cash: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <DownloadIcon />
        <h2 className="font-semibold text-app-text">Багц импортлох</h2>
      </div>
      <p className="text-xs text-app-muted mb-3">
        Голомт Капиталын хуулгаас багцыг унших. Одоо байгаа багцыг{" "}
        <strong className="text-app-text">солино</strong>, бэлэн мөнгө 0 болно.
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => run(true)}
          disabled={busy !== null}
          className="rounded-full border border-app-border px-4 py-2 text-sm font-medium text-app-text disabled:opacity-50"
        >
          {busy === "preview" ? "Уншиж байна..." : "Урьдчилж харах"}
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy !== null}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy === "import" ? "Бичиж байна..." : "Импортлох"}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-app-negative/10 p-3 text-sm text-app-negative">
          <AlertIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-sm text-app-text mb-2">
            {result.dryRun ? <AlertIcon size={16} /> : <CheckIcon size={16} />}
            <span>
              {result.dryRun
                ? "Урьдчилсан харагдац — юу ч бичээгүй"
                : "Багц шинэчлэгдлээ"}
            </span>
          </div>
          <div className="rounded-xl border border-app-border divide-y divide-app-border text-sm">
            {result.positions.map((p) => (
              <div key={p.symbol} className="flex items-center gap-3 px-3 py-2">
                <span className="font-semibold w-14">{p.symbol}</span>
                <span className="flex-1 text-right tabular-nums text-app-muted">
                  <Num value={p.quantity} digits={0} />
                </span>
                <span className="w-28 text-right tabular-nums">
                  <Num value={p.cost} digits={2} suffix="₮" />
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-3 py-2 font-semibold">
              <span className="flex-1">Нийт өртөг</span>
              <span className="tabular-nums">
                <Num value={result.costBasis} digits={2} suffix="₮" />
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-app-muted">
            {result.fills} гүйлгээ · шимтгэл{" "}
            <Num value={result.fees} digits={0} suffix="₮" />
            {result.closed.length > 0 && ` · зарж дуусгасан: ${result.closed.join(", ")}`}
            {result.excluded.length > 0 &&
              ` · үнэлгээнд ороогүй: ${result.excluded.join(", ")}`}
          </p>
        </div>
      )}
    </div>
  );
}
