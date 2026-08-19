"use client";

import { useRef, useState } from "react";
import Num from "@/components/Num";
import { AlertIcon, CheckIcon, CloseIcon, DownloadIcon } from "@/components/icons";

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
  files: number;
  from: string;
  to: string;
  reconciledDays: number;
  cash: number;
}

/**
 * Loads broker statements into this account's portfolio.
 *
 * The statements are chosen here and read on the server, which is where the
 * parser and its checks already are — the file itself is never stored, only
 * the fills it contains.
 *
 * Two buttons rather than one, because the safe half of this is worth having
 * on its own: the first shows what would be written and writes nothing, and
 * only the second replaces what is there. Importing is not additive — it
 * clears the paper positions the app opened with — so it is worth seeing the
 * list before agreeing to it.
 */
export default function StatementImport() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function choose(list: FileList | null) {
    setFiles(list ? [...list] : []);
    setResult(null);
    setError(null);
  }

  function remove(name: string) {
    setFiles((current) => current.filter((f) => f.name !== name));
    setResult(null);
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      body.append("dryRun", String(dryRun));
      body.append("cash", "0");

      const res = await fetch("/api/portfolio/import", { method: "POST", body });
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
        Голомт Капиталын гүйлгээний түүхийн PDF-ээ сонгоно уу. Хугацаа нь
        давхцахгүй бол хэдэн ч файл болно. Одоо байгаа багцыг{" "}
        <strong className="text-app-text">солино</strong>, бэлэн мөнгө 0 болно.
      </p>

      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => choose(e.target.files)}
        className="hidden"
      />

      <button
        onClick={() => input.current?.click()}
        disabled={busy !== null}
        className="w-full rounded-2xl border border-dashed border-app-border px-4 py-6 text-sm text-app-muted hover:border-brand hover:text-app-text transition-colors disabled:opacity-50"
      >
        {files.length === 0
          ? "PDF файл сонгох"
          : `${files.length} файл сонгосон — өөрчлөх`}
      </button>

      {files.length > 0 && (
        <ul className="mt-2 divide-y divide-app-border rounded-xl border border-app-border text-sm">
          {files.map((file) => (
            <li key={file.name} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 truncate text-app-text">{file.name}</span>
              <span className="text-xs text-app-muted tabular-nums">
                {Math.round(file.size / 1024)}KB
              </span>
              <button
                onClick={() => remove(file.name)}
                aria-label={`${file.name}-г хасах`}
                className="text-app-muted hover:text-app-text"
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => run(true)}
          disabled={busy !== null || files.length === 0}
          className="rounded-full border border-app-border px-4 py-2 text-sm font-medium text-app-text disabled:opacity-50"
        >
          {busy === "preview" ? "Уншиж байна..." : "Урьдчилж харах"}
        </button>
        <button
          onClick={() => run(false)}
          disabled={busy !== null || files.length === 0}
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
            {result.from} — {result.to} · {result.fills} гүйлгээ · шимтгэл{" "}
            <Num value={result.fees} digits={0} suffix="₮" /> · брокерын үлдэгдэлтэй{" "}
            {result.reconciledDays} өдөр тулгав
            {result.closed.length > 0 && ` · зарж дуусгасан: ${result.closed.join(", ")}`}
            {result.excluded.length > 0 &&
              ` · энэ аппад бүртгэлгүй тул үнэлгээнд ороогүй: ${result.excluded.join(", ")}`}
          </p>
        </div>
      )}
    </div>
  );
}
