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
        <h2 className="font-semibold text-sm">AI дүн шинжилгээ (LLM)</h2>
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
          <code className="text-neutral-200">ANTHROPIC_API_KEY</code>{" "}
          орчны хувьсагчийг тохируулах шаардлагатай.
        </p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-rose-400">{state.message}</p>
      )}

      {state.status === "ready" && state.data.parsed && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <SignalBadge signal={state.data.parsed.signal} />
            <span className="text-neutral-400">
              Итгэлцлийн түвшин: {state.data.parsed.signal_confidence}%
            </span>
            <span className="text-neutral-500 text-xs">
              {new Date(state.data.createdAt).toLocaleString("mn-MN")}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Одоогийн ханш" value={state.data.parsed.price_data.current_price} />
            <Stat label="Зорилтот 1" value={state.data.parsed.price_data.target_price_1} />
            <Stat label="Зорилтот 2" value={state.data.parsed.price_data.target_price_2} />
            <Stat label="Stop-loss" value={state.data.parsed.price_data.stop_loss} />
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
            <span>
              Эрсдэл: {RISK_LABEL[state.data.parsed.risk_assessment.risk_level]}
            </span>
            <span>
              Эрсдэл/Ашгийн харьцаа: {state.data.parsed.risk_assessment.risk_reward_ratio}
            </span>
            <span>
              Хөрвөх чадварын эрсдэл: {RISK_LABEL[state.data.parsed.risk_assessment.liquidity_risk]}
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <p>
              <span className="text-neutral-400">Техник: </span>
              {state.data.parsed.analysis_summary.technical_reason}
            </p>
            <p>
              <span className="text-neutral-400">Фундаментал: </span>
              {state.data.parsed.analysis_summary.fundamental_reason}
            </p>
            <p>
              <span className="text-neutral-400">Дүгнэлт: </span>
              {state.data.parsed.analysis_summary.overall_logic}
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
