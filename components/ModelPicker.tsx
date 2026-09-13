"use client";

import { useState } from "react";
import { RefreshIcon, SearchIcon, SendIcon } from "./icons";

/**
 * Choosing which model a provider is asked for, and finding out whether it
 * works before it is saved.
 *
 * Three things had to be true for this to be worth building rather than
 * leaving as an environment variable.
 *
 * The list is fetched rather than written down. Model names are not stable —
 * Groq retired one from under a working key — and a list kept in this file
 * would be wrong within months.
 *
 * It is a text box as well as a list. Z.AI's listing returns the billed
 * catalogue and none of the free models it will happily run, so a picker that
 * only offered what was listed would offer nothing that works. Whatever is
 * typed is what gets saved.
 *
 * And it can be tried before it is kept. A model that answers in English, or
 * truncates, or does not exist, leaves the panel broken until somebody
 * notices — so the test runs the real schema against the candidate and says
 * which script the answer came back in.
 */

interface TestResult {
  ok: boolean;
  ms?: number;
  message: string;
  mongolian?: boolean;
  sample?: string;
}

export default function ModelPicker({
  provider,
  configured,
  hasKey,
  value,
  onChange,
}: {
  provider: string;
  /** What the provider runs on today, default included. */
  configured: string;
  hasKey: boolean;
  /** The pending pick, empty meaning "leave it on the default". */
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai/models?provider=${provider}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || `Алдаа: ${res.status}`);
        setModels([]);
        return;
      }
      setModels(data.models ?? []);
    } catch (err) {
      setError((err as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && models === null && hasKey) void load();
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: value || undefined }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  const shown = (models ?? []).filter((m) =>
    m.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const picked = value.trim() || configured;

  return (
    <div className="rounded-xl border border-app-border bg-app-bg p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] text-app-muted">Загвар</div>
          <div className="truncate text-xs font-medium text-app-text" title={picked}>
            {picked}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-app-border px-2 py-1 text-[11px] text-app-text active:scale-95"
          >
            {open ? "Хаах" : "Солих"}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={!hasKey || testing}
            className="flex items-center gap-1 rounded-lg bg-brand px-2 py-1 text-[11px] font-medium text-black disabled:opacity-40 active:scale-95"
          >
            <SendIcon size={11} />
            {testing ? "Тестлэж…" : "Тест"}
          </button>
        </div>
      </div>

      {!hasKey && (
        <div className="text-[10px] text-app-muted">
          Түлхүүр оруулж хадгалсны дараа загвараа сонгох боломжтой.
        </div>
      )}

      {open && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-app-muted">
                <SearchIcon size={12} />
              </span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Загвар хайх…"
                className="w-full rounded-lg border border-app-border bg-app-card py-1.5 pl-7 pr-2 text-xs text-app-text outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading || !hasKey}
              title="Жагсаалтыг дахин татах"
              className="rounded-lg border border-app-border p-1.5 text-app-muted disabled:opacity-40 active:scale-95"
            >
              <RefreshIcon size={12} />
            </button>
          </div>

          {/* Typed as well as chosen: the listing is not the whole truth at
              every provider, and a name that is not in it still works. */}
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Гараар бичих (одоо: ${configured})`}
            className="w-full rounded-lg border border-app-border bg-app-card px-2 py-1.5 font-mono text-[11px] text-app-text outline-none focus:border-brand"
          />

          {loading && <div className="text-[10px] text-app-muted">Ачаалж байна…</div>}
          {error && <div className="text-[10px] text-app-negative">{error}</div>}

          {models !== null && !loading && (
            <>
              <div className="text-[10px] text-app-muted">
                {shown.length} / {models.length} загвар
              </div>
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {shown.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(m)}
                    className={`block w-full truncate rounded-lg px-2 py-1 text-left font-mono text-[11px] ${
                      m === picked
                        ? "bg-brand/15 text-brand"
                        : "text-app-text hover:bg-app-card"
                    }`}
                    title={m}
                  >
                    {m}
                  </button>
                ))}
                {shown.length === 0 && (
                  <div className="px-2 py-1 text-[10px] text-app-muted">
                    Тохирох загвар олдсонгүй — нэрийг нь дээр гараар бичиж болно.
                  </div>
                )}
              </div>
            </>
          )}

          {value.trim() && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[10px] text-app-muted underline"
            >
              Анхны утга руу буцаах
            </button>
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg px-2 py-1.5 text-[10px] leading-relaxed ${
            result.ok && result.mongolian !== false
              ? "bg-app-positive-bg text-app-positive"
              : result.ok
                ? "bg-app-bg text-app-muted"
                : "bg-app-negative-bg text-app-negative"
          }`}
        >
          {result.message}
          {result.sample && (
            <div className="mt-1 text-app-muted">“{result.sample}…”</div>
          )}
        </div>
      )}
    </div>
  );
}
