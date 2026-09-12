export type StatIcon = "users" | "sessions" | "orders" | "alerts";
export type StatTone = keyof typeof TONES;

/**
 * The four faces of the row.
 *
 * A colour each, because four identical cards are four cards nobody learns
 * the position of — the eye goes back to read the label every time, and a
 * dashboard whose whole job is to be glanced at is being read instead. After
 * a week the blue one is where the orders are, before the word is read.
 *
 * The colour is identity, not judgement. Nothing on this page is good or bad
 * news — a count of alerts is neither — so none of these is red. Red means
 * exactly one thing in this section, which is a confirmation that something
 * is about to be destroyed.
 *
 * Green leads because it is the product's own; the rest are the reference's
 * family, held to one lightness so the row reads as a set rather than as four
 * things that happened to be coloured.
 */
const TONES = {
  brand: { from: "#06996a", to: "#047a55" },
  slate: { from: "#3c4a5d", to: "#26303e" },
  blue: { from: "#3b82f6", to: "#1d5fd0" },
  violet: { from: "#8b5cf6", to: "#6d33d4" },
} as const;

/**
 * One figure, in four parts: what it counts, the count, how it moved, and
 * what it was before.
 *
 * The last of those is the one most dashboards leave out, and it is the one
 * that makes a change mean anything — "+7.5%" against a base nobody states
 * could be six accounts or six hundred. The previous figure goes at the foot
 * of the card in words, so the percentage above it never has to be trusted on
 * its own.
 */
export default function StatCard({
  tone,
  label,
  value,
  delta,
  direction = "flat",
  previous,
  icon,
}: {
  tone: StatTone;
  label: string;
  value: React.ReactNode;
  /** Short, e.g. "7.5%". The arrow comes from `direction`. */
  delta?: string;
  direction?: "up" | "down" | "flat";
  /** What it was, e.g. "7 хоногийн өмнө: 89". */
  previous?: React.ReactNode;
  icon: StatIcon;
}) {
  const t = TONES[tone];

  return (
    <div
      className="relative flex min-w-0 flex-col justify-between gap-5 overflow-hidden rounded-2xl p-5"
      style={{ background: `linear-gradient(142deg, ${t.from}, ${t.to})` }}
    >
      {/* Behind the figure, clipped by the corner and allowed to be. It is a
          watermark for the tile — something to recognise it by at arm's
          length — not a picture anybody is meant to look at, which is why it
          runs off the edge instead of being politely inset. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-5 -left-4 text-white opacity-[0.16]"
      >
        <Glyph name={icon} size={150} />
      </span>

      <div className="relative flex items-start gap-3">
        <span className="text-[13px] font-semibold tracking-[0.02em] text-white/85 uppercase">
          {label}
        </span>
        <span className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/18 text-white">
          <Glyph name={icon} size={20} />
        </span>
      </div>

      <div className="relative">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[32px] leading-none font-bold tracking-[-0.03em] text-white tabular-nums lg:text-[36px]">
            {value}
          </span>
          {delta && <DeltaChip delta={delta} direction={direction} />}
        </div>
        {previous && (
          <div className="mt-3 text-[13px] text-white/75">{previous}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The change, in the one colour that reads on every tile in the row.
 *
 * Green-for-up on a green tile is invisible and on a violet one is a clash,
 * so the chip is the tile's own white at low opacity and the arrow carries
 * the direction. Which way, not whether.
 */
function DeltaChip({
  delta,
  direction,
}: {
  delta: string;
  direction: "up" | "down" | "flat";
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-white">
      {direction !== "flat" && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d={
              direction === "up"
                ? "M6 9.5V2.5M2.8 5.7 6 2.5l3.2 3.2"
                : "M6 2.5v7M2.8 6.3 6 9.5l3.2-3.2"
            }
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {delta}
    </span>
  );
}

/**
 * One mark, drawn twice per card: small and stroked in the badge, large and
 * filled as the watermark. Filled at size, because a 1.5px outline blown up
 * to 150px is a wireframe.
 */
function Glyph({ name, size }: { name: StatIcon; size: number }) {
  const big = size > 40;
  const paint = big
    ? { fill: "currentColor" }
    : {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.7,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      };
  const box = { width: size, height: size, viewBox: "0 0 24 24" };

  if (name === "users") {
    return (
      <svg {...box}>
        <circle cx="9.5" cy="8" r="3.3" {...paint} />
        <path
          d={big ? "M3.6 19.4c1-3.4 3.3-5 5.9-5s4.9 1.6 5.9 5z" : "M3.6 19.4c1-3.4 3.3-5 5.9-5s4.9 1.6 5.9 5"}
          {...paint}
        />
        <path d="M16.6 5.6a3.2 3.2 0 0 1 0 4.8" {...paint} fill="none" stroke="currentColor" strokeWidth={big ? 1.6 : 1.7} strokeLinecap="round" />
        <path d="M18.2 14.7c1.3.8 2.2 2.2 2.7 4.5" {...paint} fill="none" stroke="currentColor" strokeWidth={big ? 1.6 : 1.7} strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "sessions") {
    return (
      <svg {...box}>
        <circle cx="12" cy="12" r="8.6" {...paint} />
        <path
          d="M4.3 12.2h2.8l1.7-3.3 2.5 6.7 2-4 1.2 2.2h3.1"
          fill="none"
          stroke={big ? "#ffffff" : "currentColor"}
          strokeOpacity={big ? 0.55 : 1}
          strokeWidth={big ? 1.4 : 1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...box}>
        <path d="M5.2 3.8h13.6v16.4l-3.4-2-3.4 2-3.4-2-3.4 2z" {...paint} />
        <path
          d="M8.7 8.6h6.6M8.7 12.3h4.1"
          fill="none"
          stroke={big ? "#ffffff" : "currentColor"}
          strokeOpacity={big ? 0.5 : 1}
          strokeWidth={big ? 1.4 : 1.7}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg {...box}>
      <path d="M18.2 9.4a6.2 6.2 0 1 0-12.4 0c0 6.2-2 7.3-2 7.3h16.4s-2-1.1-2-7.3Z" {...paint} />
      <path
        d="M13.8 20a2.1 2.1 0 0 1-3.6 0"
        fill={big ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
