import type { Signal } from "@/lib/types";

const STYLES: Record<Signal, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  SELL: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30",
  HOLD: "bg-neutral-500/15 text-neutral-300 ring-1 ring-neutral-500/30",
};

const LABELS: Record<Signal, string> = {
  BUY: "АВАХ",
  SELL: "ЗАРАХ",
  HOLD: "ХҮЛЭЭХ",
};

export default function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[signal]}`}
    >
      {LABELS[signal]}
    </span>
  );
}
