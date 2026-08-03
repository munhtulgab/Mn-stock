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
    <div className="border border-term-border bg-term-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-wider text-term-amber">
          AI Consensus // Multi-LLM
        </h2>
        {state.status === "ready" && (
          <button
            onClick={() => load(true)}
            className="text-[11px] uppercase text-term-muted hover:text-term-amber"
          >
            Recompute
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <button
          onClick={() => load(false)}
          className="border border-term-amber text-term-amber text-xs uppercase tracking-wide px-3 py-1.5 font-bold hover:bg-term-amber hover:text-black transition-colors"
        >
          Run AI Analysis
        </button>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-term-muted term-cursor">Тооцоолж байна</p>
      )}

      {state.status === "not_configured" && (
        <p className="text-xs text-term-muted">
          AI дүн шинжилгээ ажиллуулахын тулд{" "}
          <a href="/settings" className="underline text-term-amber">
            Тохиргоо
          </a>{" "}
          хуудсан дээр дор хаяж нэг API түлхүүр (Claude, Gemini, Groq эсвэл
          OpenRouter) тохируулах шаардлагатай.
        </p>
      )}

      {state.status === "error" && (
        <div className="space-y-1">
          <p className="text-xs text-term-red font-semibold uppercase tracking-wide">
            Бүх AI үйлчилгээ амжилтгүй боллоо
          </p>
          <div className="space-y-1">
            {state.message.split(/;\s*(?=\w+:)/).map((line, i) => (
              <div
                key={i}
                className="text-[11px] text-term-red/90 bg-term-red/5 border border-term-red/30 px-2 py-1 break-words whitespace-pre-wrap"
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
            <span className="text-term-muted uppercase tracking-wide">
              Confidence: <span className="text-term-text">{state.data.consensus.signal_confidence}%</span>
            </span>
            <span className="text-term-muted uppercase tracking-wide">
              Agreement: <span className="text-term-text">{Math.round(state.data.agreement * 100)}%</span> ({state.data.providersUsed} providers)
            </span>
            <span className="text-term-muted">
              {new Date(state.data.createdAt).toLocaleString("mn-MN")}
            </span>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2">
            {state.data.providers.map((p) => (
              <div
                key={p.provider}
                className={`border px-2 py-1.5 ${
                  p.ok
                    ? "border-term-border"
                    : "border-term-red/40 bg-term-red/5"
                }`}
              >
                <div className="flex items-center justify-between uppercase tracking-wide">
                  <span className="font-bold text-term-text">
                    {PROVIDER_LABEL[p.provider] ?? p.provider}
                  </span>
                  {p.ok ? (
                    <span className="text-term-text">
                      {p.signal} ({p.confidence}%)
                    </span>
                  ) : (
                    <span className="text-term-red font-bold">ERROR</span>
                  )}
                </div>
                {!p.ok && p.error && (
                  <div className="mt-1 text-[10.5px] text-term-red/90 normal-case tracking-normal break-words whitespace-pre-wrap">
                    {p.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-term-border border border-term-border">
            <Stat label="Current" value={state.data.consensus.price_data.current_price} />
            <Stat label="Target 1" value={state.data.consensus.price_data.target_price_1} accent="text-term-green" />
            <Stat label="Target 2" value={state.data.consensus.price_data.target_price_2} accent="text-term-green" />
            <Stat label="Stop-loss" value={state.data.consensus.price_data.stop_loss} accent="text-term-red" />
          </div>

          <div className="flex flex-wrap gap-4 text-term-muted uppercase tracking-wide">
            <span>
              Risk: <span className="text-term-text">{RISK_LABEL[state.data.consensus.risk_assessment.risk_level]}</span>
            </span>
            <span>
              R:R <span className="text-term-text">{state.data.consensus.risk_assessment.risk_reward_ratio}</span>
            </span>
            <span>
              Liquidity risk: <span className="text-term-text">{RISK_LABEL[state.data.consensus.risk_assessment.liquidity_risk]}</span>
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-term-border normal-case tracking-normal">
            <p>
              <span className="text-term-amber uppercase text-[11px] tracking-wide">Техник: </span>
              {state.data.consensus.analysis_summary.technical_reason}
            </p>
            <p>
              <span className="text-term-amber uppercase text-[11px] tracking-wide">Фундаментал: </span>
              {state.data.consensus.analysis_summary.fundamental_reason}
            </p>
            <p>
              <span className="text-term-amber uppercase text-[11px] tracking-wide">Дүгнэлт: </span>
              {state.data.consensus.analysis_summary.overall_logic}
            </p>
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-term-bg px-3 py-2">
      <div className="text-[10px] text-term-muted uppercase tracking-wide">{label}</div>
      <div className={`tabular-nums font-semibold ${accent ?? "text-term-text"}`}>
        {value.toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
