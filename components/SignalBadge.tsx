import type { Signal } from "@/lib/types";

const STYLES: Record<Signal, string> = {
  BUY: "bg-app-positive-bg text-app-positive",
  SELL: "bg-app-negative-bg text-app-negative",
  HOLD: "bg-brand-light text-brand",
};

const LABELS: Record<Signal, string> = {
  BUY: "АВАХ",
  SELL: "ЗАРАХ",
  HOLD: "ХҮЛЭЭХ",
};

export default function SignalBadge({ signal }: { signal: Signal }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${STYLES[signal]}`}
    >
      {LABELS[signal]}
    </span>
  );
}
