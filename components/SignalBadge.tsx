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

/**
 * Solid shapes rather than stroked arrows: the badge sits at 9px in a market
 * row, where a 1.5px stroke turns to mush. Sized in `em` so the glyph tracks
 * the label instead of needing a size of its own.
 */
const ICONS: Record<Signal, React.ReactNode> = {
  BUY: <path d="M6 2 10.5 9.5h-9z" />,
  SELL: <path d="M6 10 1.5 2.5h9z" />,
  HOLD: <rect x="1.5" y="5" width="9" height="2" rx="1" />,
};

/** Sizes: `md` stands on its own, `sm` rides alongside a symbol in a list row. */
const SIZES = {
  md: "gap-1 px-2.5 py-1 text-[11px]",
  sm: "gap-0.5 px-1.5 py-0.5 text-[9px]",
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
      <svg
        width="1em"
        height="1em"
        viewBox="0 0 12 12"
        fill="currentColor"
        className="shrink-0"
        aria-hidden
      >
        {ICONS[signal]}
      </svg>
      {LABELS[signal]}
    </span>
  );
}
