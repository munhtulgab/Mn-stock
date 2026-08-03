import type { Signal } from "@/lib/types";

const STYLES: Record<Signal, string> = {
  BUY: "bg-term-green/10 text-term-green border border-term-green",
  SELL: "bg-term-red/10 text-term-red border border-term-red",
  HOLD: "bg-term-yellow/10 text-term-yellow border border-term-yellow",
};

const LABELS: Record<Signal, string> = {
  BUY: "АВАХ",
  SELL: "ЗАРАХ",
  HOLD: "ХҮЛЭЭХ",
};

export default function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STYLES[signal]}`}
    >
      {LABELS[signal]}
    </span>
  );
}
