"use client";

import { useEffect, useState } from "react";
import SignalBadge from "./SignalBadge";
import { RefreshIcon, SparkIcon } from "./icons";
import type { AiSignal } from "@/lib/types";
import { ulaanbaatarDateTime } from "@/lib/day";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "not_configured" }
  | { status: "ready"; data: AiSignal };

const RISK_LABEL: Record<string, string> = {
  LOW: "Бага",
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
};

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  cerebras: "Cerebras",
  cloudflare: "Cloudflare",
};

export default function AiSignalPanel({ symbol }: { symbol: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function load(force: boolean) {
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/securities/${symbol}/ai-signal${force ? "?force=1" : ""}`,
      );
      if (res.status === 501) {
        setState({ status: "not_configured" });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          status: "error",
          message: body.message || `Алдаа: ${res.status}`,
        });
        return;
      }
      const data = (await res.json()) as AiSignal;
      setState({ status: "ready", data });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  // Nothing has been asked for yet, so there is nothing to put in a panel:
  // a card drawn round a single button is a box with a lid and no contents,
  // and a heading over it names an answer that does not exist. The button
  // stands on its own until there is something to head.
  if (state.status === "idle") {
    return (
      <button
        onClick={() => load(false)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand text-black text-base font-bold py-4 active:scale-[0.98] transition-transform"
      >
        <SparkIcon size={18} /> AI дүн шинжилгээ хийх
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-app-text text-sm">AI дүгнэлт (олон загвар)</h2>
        {state.status === "ready" && (
          <button
            onClick={() => load(true)}
            className="flex items-center gap-1 text-xs text-brand font-medium"
          >
            <RefreshIcon size={13} /> Дахин тооцоолох
          </button>
        )}
      </div>

      {state.status === "loading" && <Loader />}

      {state.status === "not_configured" && (
        <p className="text-xs text-app-muted">
          AI дүн шинжилгээ ажиллуулахын тулд{" "}
          <a href="/settings" className="underline text-brand font-medium">
            Тохиргоо
          </a>{" "}
          хуудсан дээр дор хаяж нэг API түлхүүр (Claude, Gemini, Groq эсвэл
          OpenRouter) тохируулах шаардлагатай.
        </p>
      )}

      {state.status === "error" && (
        <div className="space-y-1.5">
          <p className="text-xs text-app-negative font-semibold">
            Бүх AI үйлчилгээ амжилтгүй боллоо
          </p>
          <div className="space-y-1.5">
            {state.message.split(/;\s*(?=\w+:)/).map((line, i) => (
              <div
                key={i}
                className="text-[11px] text-app-negative bg-app-negative-bg rounded-xl px-2.5 py-1.5 break-words whitespace-pre-wrap"
              >
                {line.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <SignalBadge signal={state.data.consensus.signal} />
            <span className="text-app-muted">
              Итгэлцэл: <span className="text-app-text font-medium">{state.data.consensus.signal_confidence}%</span>
            </span>
            <span className="text-app-muted">
              Санал нэгдэл: <span className="text-app-text font-medium">{Math.round(state.data.agreement * 100)}%</span> ({state.data.providersUsed} эх сурвалж)
            </span>
            <span className="text-app-muted">
              {ulaanbaatarDateTime(state.data.createdAt)}
            </span>
          </div>

          {/* One row, centred. Two of them in a grid left the third alone
              under an empty half; abreast they read as what they are — the
              same question put to every model. */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {state.data.providers.map((p) => (
              <div
                key={p.provider}
                className={`min-w-0 flex-1 basis-40 rounded-xl border px-2.5 py-1.5 ${
                  p.ok
                    ? "border-app-border"
                    : "border-app-negative/30 bg-app-negative-bg"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-app-text">
                    {PROVIDER_LABEL[p.provider] ?? p.provider}
                  </span>
                  {p.ok ? (
                    <span className="text-app-text">
                      {p.signal} ({p.confidence}%)
                    </span>
                  ) : (
                    <span className="text-app-negative font-semibold">Алдаа</span>
                  )}
                </div>
                {!p.ok && p.error && (
                  <div className="mt-1 text-[10.5px] text-app-negative break-words whitespace-pre-wrap">
                    {p.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Одоогийн" value={state.data.consensus.price_data.current_price} />
            <Stat label="Зорилт 1" value={state.data.consensus.price_data.target_price_1} accent="text-app-positive" />
            <Stat label="Зорилт 2" value={state.data.consensus.price_data.target_price_2} accent="text-app-positive" />
            <Stat label="Алдагдал хязгаарлах" value={state.data.consensus.price_data.stop_loss} accent="text-app-negative" />
          </div>

          <div className="flex flex-wrap gap-4 text-app-muted pt-1">
            <span>
              Эрсдэл: <span className="text-app-text font-medium">{RISK_LABEL[state.data.consensus.risk_assessment.risk_level]}</span>
            </span>
            <span>
              Эрсдэл:өгөөж <span className="text-app-text font-medium">{state.data.consensus.risk_assessment.risk_reward_ratio}</span>
            </span>
            <span>
              Ликвидийн эрсдэл: <span className="text-app-text font-medium">{RISK_LABEL[state.data.consensus.risk_assessment.liquidity_risk]}</span>
            </span>
          </div>

          <div className="space-y-2 pt-3 border-t border-app-border">
            <p>
              <span className="text-brand font-semibold">Техник: </span>
              <span className="text-app-text">{state.data.consensus.analysis_summary.technical_reason}</span>
            </p>
            <p>
              <span className="text-brand font-semibold">Фундаментал: </span>
              <span className="text-app-text">{state.data.consensus.analysis_summary.fundamental_reason}</span>
            </p>
            <p>
              <span className="text-brand font-semibold">Дүгнэлт: </span>
              <span className="text-app-text">{state.data.consensus.analysis_summary.overall_logic}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A run takes twenty to forty seconds: the company's page is re-fetched from
 * the exchange, its news is gathered, and every configured model is asked.
 * A single line of text for that long reads as a hang, so this shows the
 * clock running and the shape of the answer that is coming.
 *
 * The bar is deliberately indeterminate. Nothing here knows how far along a
 * model is, and a bar that pretends to would be making it up.
 */
function Loader() {
  const [seconds, setSeconds] = useState(0);

  // Counted rather than measured against a start time read during render:
  // reading the clock while rendering is not idempotent.
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="animate-spin text-brand">
          <SpinnerIcon size={18} />
        </span>
        <span className="text-sm font-semibold text-app-text">
          AI дүн шинжилгээ хийж байна…
        </span>
        <span className="ml-auto text-xs tabular-nums text-app-muted">
          {seconds}с
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-elevated">
        <div className="ai-progress h-full w-1/3 rounded-full bg-brand" />
      </div>

      <p className="text-[11px] text-app-muted">
        Ханш, санхүүгийн тайлан, мэдээг цуглуулаад тохируулсан загвар бүрээс
        дүгнэлт авч байна. Ихэвчлэн 20-40 секунд үргэлжилнэ.
      </p>

      <div className="space-y-2 pt-1">
        <div className="skeleton h-6 w-40 rounded-full" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}

function SpinnerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-app-bg px-3 py-2">
      <div className="text-[10px] text-app-muted">{label}</div>
      <div className={`tabular-nums font-semibold ${accent ?? "text-app-text"}`}>
        {value.toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
