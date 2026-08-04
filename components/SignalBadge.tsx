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

/** Sizes: `md` stands on its own, `sm` rides alongside a symbol in a list row. */
const SIZES = {
  md: "px-2.5 py-1 text-[11px]",
  sm: "px-1.5 py-0.5 text-[9px]",
} as const;

export default function SignalBadge({
  signal,
  size = "md",
}: {
  signal: Signal;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold ${SIZES[size]} ${STYLES[signal]}`}
    >
      {LABELS[signal]}
    </span>
  );
}
