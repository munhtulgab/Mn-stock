/**
 * One headline figure, over its own mark.
 *
 * Used on both sides of the app — the reader's portfolio card and the
 * administrator's account summary ask the same four or six questions of an
 * account, and asking them in two different shapes was two things to
 * maintain and two things to learn. Every colour here is a token, so the tile
 * takes the daylight palette in the admin area and the dark one in the app
 * without being told which it is in.
 *
 * The glyph is the tile's background rather than a badge beside the label. At
 * fifteen pixels in a tinted square it was a smudge, and it was taking the
 * width the label needed. Run large and off the corner it is something to
 * recognise the tile by before the words are read, which is the whole job of
 * a mark on a figure nobody reads twice.
 *
 * Clipped rather than inset. A watermark politely fitted inside the padding
 * is a picture, and a picture in a tile this size competes with the number;
 * one that runs off the edge is a texture, and stays behind it. It is also
 * why a panel of these carries no mark of its own: a wash and one more glyph
 * under tiles that each have one is a busy ground for a grid whose whole job
 * is to be read at a glance.
 */
export default function StatTile({
  icon,
  label,
  value,
  note,
  tone = "flat",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  /** A line under the figure saying what it is made of. */
  note?: string;
  /** Colours the figure and its mark. Only where up or down means something. */
  tone?: "positive" | "negative" | "flat";
}) {
  const ink =
    tone === "positive"
      ? "var(--app-positive)"
      : tone === "negative"
        ? "var(--app-negative)"
        : "var(--brand-dark)";

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-app-border p-3">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -bottom-4 opacity-[0.14]"
        style={{ color: ink }}
      >
        {icon}
      </span>
      <div className="relative">
        <div className="text-[11px] leading-tight text-app-muted">{label}</div>
        {/* Steps up with the room. Two tögrög figures to the penny do not fit
            side by side at 390px in the size they take on a laptop, and a
            figure that has to be truncated to fit is not a figure. */}
        <div
          className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.02em] tabular-nums sm:text-[17px] lg:text-[19px]"
          style={tone === "flat" ? undefined : { color: ink }}
        >
          {value}
        </div>
        {note && <div className="mt-0.5 truncate text-[10px] text-app-muted">{note}</div>}
      </div>
    </div>
  );
}

/**
 * The marks, drawn at the size they are used: 84px behind a figure. Stroke
 * weight is in viewBox units, so the 1.9 that reads as a hairline at fifteen
 * pixels renders seven pixels thick at this size — heavy enough to read as a
 * drawing rather than as a ground for one.
 */
const TILE = {
  width: 84,
  height: 84,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * A wallet, with the card pocket that makes it one. Without it the mark is a
 * rounded rectangle with a dash in it, which passed at fifteen pixels and
 * reads as an empty box at eighty.
 */
export function WalletGlyph() {
  return (
    <svg {...TILE}>
      <path d="M3.2 8.4c0-1.5 1.2-2.7 2.7-2.7h12c1.5 0 2.7 1.2 2.7 2.7v7.2c0 1.5-1.2 2.7-2.7 2.7h-12a2.7 2.7 0 0 1-2.7-2.7Z" />
      <path d="M20.6 10.3h-4.2a1.7 1.7 0 0 0 0 3.4h4.2" />
      <path d="M17.1 12h.1" strokeWidth={2.6} />
    </svg>
  );
}

/** Money going in: what was paid for what is held. */
export function DepositGlyph() {
  return (
    <svg {...TILE}>
      <path d="M12 3.6v9.8M8.4 10l3.6 3.4 3.6-3.4" />
      <path d="M4.4 15.4v2.4c0 1.2 1 2.2 2.2 2.2h10.8c1.2 0 2.2-1 2.2-2.2v-2.4" />
    </svg>
  );
}

/**
 * Coins, for the money that has not been spent on anything yet.
 *
 * A banknote was the first draft and it read as a camera at eighty pixels: a
 * rounded rectangle with a circle in the middle of it is a lens before it is
 * money. A stack of coins has no other reading, and it is not the wallet the
 * total value already wears.
 */
export function CashGlyph() {
  return (
    <svg {...TILE}>
      <ellipse cx="9" cy="7" rx="5.6" ry="2.6" />
      <path d="M3.4 7v3.4c0 1.4 2.5 2.6 5.6 2.6s5.6-1.2 5.6-2.6V7" />
      <path d="M14.6 10.6c2.7.3 4.6 1.4 4.6 2.6 0 1.4-2.5 2.6-5.6 2.6-1 0-2-.1-2.8-.4" />
      <path d="M8 16.3v.5c0 1.4 2.5 2.6 5.6 2.6s5.6-1.2 5.6-2.6v-3.6" />
    </svg>
  );
}

/** Which way it went. The arrow, not the colour, carries the direction. */
export function TrendGlyph({ down }: { down?: boolean }) {
  return (
    <svg {...TILE}>
      <path d={down ? "M3.8 7.4 10 13.6l3.4-3.4 6.8 6.8" : "M3.8 16.6 10 10.4l3.4 3.4 6.8-6.8"} />
      <path d={down ? "M20.2 12.4v4.6h-4.6" : "M20.2 11.6V7h-4.6"} />
    </svg>
  );
}

export function PercentGlyph() {
  return (
    <svg {...TILE}>
      <path d="M18.4 5.6 5.6 18.4" />
      <circle cx="7.6" cy="7.6" r="2.4" />
      <circle cx="16.4" cy="16.4" r="2.4" />
    </svg>
  );
}

export function OrderGlyph() {
  return (
    <svg {...TILE}>
      <path d="M6 3.8h12v16.4l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9 8.6h6M9 12.3h4" />
    </svg>
  );
}

export function StackGlyph() {
  return (
    <svg {...TILE}>
      <path d="m12 3.4 8.2 4.2L12 11.8 3.8 7.6z" />
      <path d="m3.8 12 8.2 4.2 8.2-4.2M3.8 16.4l8.2 4.2 8.2-4.2" />
    </svg>
  );
}
