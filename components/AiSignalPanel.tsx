"use client";

import { useState } from "react";
import SignalBadge from "./SignalBadge";
import type { AiSignal } from "@/lib/types";

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

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm">AI дүн шинжилгээ (олон LLM)</h2>
        {state.status === "ready" && (
          <button
            onClick={() => load(true)}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline"
          >
            Дахин тооцоолох
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <button
          onClick={() => load(false)}
          className="rounded-md bg-neutral-100 text-neutral-900 text-sm px-3 py-1.5 font-medium hover:bg-white"
        >
          AI дүн шинжилгээ авах
        </button>
      )}

      {state.status === "loading" && (
        <p className="text-sm text-neutral-400">Тооцоолж байна...</p>
      )}

      {state.status === "not_configured" && (
        <p className="text-sm text-neutral-400">
          AI дүн шинжилгээ ажиллуулахын тулд{" "}
          <a href="/settings" className="underline text-neutral-200">
            Тохиргоо
          </a>{" "}
          хуудсан дээр дор хаяж нэг API түлхүүр (Claude, Gemini, Groq эсвэл
          OpenRouter) тохируулах шаардлагатай.
        </p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-rose-400">{state.message}</p>
      )}

      {state.status === "ready" && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <SignalBadge signal={state.data.consensus.signal} />
            <span className="text-neutral-400">
              Итгэлцлийн түвшин: {state.data.consensus.signal_confidence}%
            </span>
            <span className="text-neutral-400">
              Тохиролцоо: {Math.round(state.data.agreement * 100)}% (
              {state.data.providersUsed} үйлчилгээнээс)
            </span>
            <span className="text-neutral-500 text-xs">
              {new Date(state.data.createdAt).toLocaleString("mn-MN")}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {state.data.providers.map((p) => (
              <span
                key={p.provider}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${
                  p.ok
                    ? "bg-neutral-800/60 text-neutral-300 ring-neutral-700"
                    : "bg-rose-500/10 text-rose-400 ring-rose-500/20"
                }`}
                title={p.error}
              >
                {PROVIDER_LABEL[p.provider] ?? p.provider}
                {p.ok ? `: ${p.signal} (${p.confidence}%)` : ": алдаа"}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Одоогийн ханш" value={state.data.consensus.price_data.current_price} />
            <Stat label="Зорилтот 1" value={state.data.consensus.price_data.target_price_1} />
            <Stat label="Зорилтот 2" value={state.data.consensus.price_data.target_price_2} />
            <Stat label="Stop-loss" value={state.data.consensus.price_data.stop_loss} />
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
            <span>
              Эрсдэл: {RISK_LABEL[state.data.consensus.risk_assessment.risk_level]}
            </span>
            <span>
              Эрсдэл/Ашгийн харьцаа: {state.data.consensus.risk_assessment.risk_reward_ratio}
            </span>
            <span>
              Хөрвөх чадварын эрсдэл: {RISK_LABEL[state.data.consensus.risk_assessment.liquidity_risk]}
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <p>
              <span className="text-neutral-400">Техник: </span>
              {state.data.consensus.analysis_summary.technical_reason}
            </p>
            <p>
              <span className="text-neutral-400">Фундаментал: </span>
              {state.data.consensus.analysis_summary.fundamental_reason}
            </p>
            <p>
              <span className="text-neutral-400">Дүгнэлт: </span>
              {state.data.consensus.analysis_summary.overall_logic}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="tabular-nums font-medium">
        {value.toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
