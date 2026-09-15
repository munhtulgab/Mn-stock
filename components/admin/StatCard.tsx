export type StatIcon = "users" | "sessions" | "orders" | "alerts";
export type StatTone = keyof typeof TONES;

/**
 * The four faces of the row, all of them green.
 *
 * A colour each, because four identical cards are four cards nobody learns
 * the position of — the eye goes back to read the label every time, and a
 * dashboard whose whole job is to be glanced at is being read instead. After
 * a week the olive one is where the alerts are, before the word is read.
 *
 * One family rather than four, so the row reads as this product's row and not
 * as four things that happened to be coloured. Green all the way across is a
 * narrower brief than blue-and-violet was, and it is met by moving along the
 * hue rather than only down the lightness: teal-green at one end, olive at
 * the other, with the brand's own emerald and a true green between them. Four
 * greens that differ only in how dark they are would be a gradient, and a
 * gradient is not four identities.
 *
 * Lightness still varies — the teal is a full stop darker than the rest — so
 * the row is not sorted by hue alone, which is the one cue a reader with
 * green-weak vision does not have. The mark behind each figure and the label
 * on it are what carry the identity for them; the colour is the shortcut, not
 * the statement.
 *
 * Every face clears 4.5:1 against white at its lightest point, which is where
 * the 13px label sits. The brand green this row used to open with did not —
 * it measured 3.64:1, passing for the 32px figure and failing for the word
 * above it — so the emerald here is a step deeper than the one on the buttons.
 *
 * The colour is identity, not judgement. Nothing on this page is good or bad
 * news — a count of alerts is neither — so none of these is red. Red means
 * exactly one thing in this section, which is a confirmation that something
 * is about to be destroyed.
 */
const TONES = {
  emerald: { from: "#047857", to: "#065f46" },
  teal: { from: "#115e59", to: "#134e4a" },
  green: { from: "#15803d", to: "#166534" },
  olive: { from: "#4d7c0f", to: "#3f6212" },
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
  trend,
  trendDays,
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
  /** Seven daily counts, oldest first, drawn behind the figure. */
  trend?: number[];
  /** The days those counts are for, same order — used for the hover title. */
  trendDays?: string[];
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

      {trend && trend.length > 0 && (
        <Sparkline values={trend} days={trendDays} />
      )}

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
          {/* Grows at xl, not at lg: with four cards across, the laptop is
              where a column is narrowest, and 36px there is what pushes the
              change chip onto a line of its own. */}
          <span className="text-[32px] leading-none font-bold tracking-[-0.03em] text-white tabular-nums xl:text-[36px]">
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

/**
 * The last seven days, behind the figure rather than beside it.
 *
 * A tile's job is one number read at a glance, and a chart placed next to
 * that number competes with it — the eye has two things to land on and picks
 * neither. Set behind, at the opacity the glyph watermark already uses, it
 * answers the second question the number raises ("and is that going
 * anywhere?") only once the first has been read. It is a shape, not a
 * reading: the figures it summarises are the card's own value and the line
 * beneath it.
 *
 * Bars rather than a line. Seven points is too few for a line to have a
 * shape — it reads as six angles — and these are counts of separate days
 * rather than samples of something continuous, which is what a bar says and
 * a line does not.
 *
 * Today is drawn brighter than the six behind it, the stat tile's usual
 * "current period in the accent": on a card whose whole palette is one white
 * at varying opacity, that is the only accent there is.
 */
function Sparkline({ values, days }: { values: number[]; days?: string[] }) {
  // Against the busiest day rather than against zero, so a quiet week still
  // has a shape. A week with nothing in it draws nothing, which is honest —
  // seven bars of equal height would suggest seven equal days.
  const peak = Math.max(...values);
  if (peak <= 0) return null;

  // Seven bars, two-pixel gaps, 61px of lane in all. Measured against the
  // narrowest the card ever is — four across at 1024px, where the sessions
  // tile's "Идэвхтэй" chip is the longest thing on the value row: at nine
  // pixels a bar the two overlapped by four, and text laid over bars reads
  // as a rendering fault rather than as a watermark.
  const BAR = 7;
  const GAP = 2;
  const H = 54;
  const width = values.length * BAR + (values.length - 1) * GAP;

  return (
    <span
      className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
      aria-hidden
    >
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} fill="none">
        {values.map((n, i) => {
          // A day with something in it is never a sliver: below about three
          // pixels a bar reads as the axis, and "one order" and "no orders"
          // have to look different.
          const h = n === 0 ? 0 : Math.max(3, Math.round((n / peak) * H));
          const today = i === values.length - 1;
          return (
            <rect
              key={days?.[i] ?? i}
              x={i * (BAR + GAP)}
              y={H - h}
              width={BAR}
              height={h}
              rx={4}
              fill="#ffffff"
              opacity={today ? 0.42 : 0.18}
            />
          );
        })}
      </svg>
    </span>
  );
}
