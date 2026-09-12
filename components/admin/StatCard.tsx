/**
 * One figure, as a tile with a colour of its own.
 *
 * Four cards that look identical are four cards nobody learns the position
 * of; the eye goes looking for the label every time. A colour, an icon and a
 * shape per metric make each one findable before it is read — after a week an
 * administrator glances at the amber one because that is where the sessions
 * live, not because they read the word.
 *
 * The colour is identity, not judgement. Nothing on this dashboard is good or
 * bad news — a count of alerts is neither — so no tile is red, and the change
 * beneath the figure takes the tile's own hue with an arrow for the
 * direction. Red is kept for the things that really are destructive, which in
 * this section is the delete confirmations and nothing else.
 *
 * Dark tiles on a light page on purpose. They are the one band of the admin
 * area that is looked at rather than worked in, and giving them weight is
 * what stops the dashboard from reading as an undifferentiated field of white
 * cards. Their colours are stated here rather than in globals.css: four
 * decorative tones used in one place are a table, not a design system.
 */
const TONES = {
  emerald: {
    from: "#0f2f2b",
    to: "#0a1e21",
    border: "rgba(45, 212, 167, 0.34)",
    glow: "rgba(45, 212, 167, 0.18)",
    accent: "#2dd4a7",
  },
  blue: {
    from: "#102544",
    to: "#0b1830",
    border: "rgba(76, 157, 253, 0.34)",
    glow: "rgba(76, 157, 253, 0.18)",
    accent: "#5aa6ff",
  },
  amber: {
    from: "#2e2512",
    to: "#20190b",
    border: "rgba(245, 181, 63, 0.34)",
    glow: "rgba(245, 181, 63, 0.16)",
    accent: "#f5b53f",
  },
  violet: {
    from: "#231b3f",
    to: "#171130",
    border: "rgba(167, 139, 250, 0.34)",
    glow: "rgba(167, 139, 250, 0.18)",
    accent: "#a78bfa",
  },
} as const;

export type StatTone = keyof typeof TONES;
export type StatIcon = "users" | "sessions" | "orders" | "alerts";

export default function StatCard({
  tone,
  icon,
  label,
  value,
  delta,
  direction = "up",
  compare,
}: {
  tone: StatTone;
  icon: StatIcon;
  label: string;
  value: React.ReactNode;
  /** Short, e.g. "+6". Omitted when there is nothing to compare against. */
  delta?: string;
  direction?: "up" | "down" | "flat";
  /** What the change is against, e.g. "vs өмнөх 7 хоног". */
  compare?: React.ReactNode;
}) {
  const t = TONES[tone];

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 lg:p-5"
      style={{
        background: `linear-gradient(152deg, ${t.from} 0%, ${t.to} 100%)`,
        border: `1px solid ${t.border}`,
        boxShadow: `0 14px 34px -18px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      {/* Sits behind the figure and is allowed to be clipped by the corner —
          it is a mark for the tile, not a picture to be looked at. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1 -right-2 lg:top-1 lg:right-2"
        style={{ color: t.accent }}
      >
        <Glyph name={icon} />
      </span>

      <div className="relative">
        <div className="text-[13px] font-medium text-white/80 lg:text-[15px]">{label}</div>
        <div className="mt-1 text-[32px] leading-none font-extrabold tracking-[-0.03em] text-white tabular-nums lg:text-[40px]">
          {value}
        </div>
        {(delta || compare) && (
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-[12px] lg:text-[13px]">
            {delta && (
              <span className="font-semibold whitespace-nowrap" style={{ color: t.accent }}>
                {delta}
                {direction !== "flat" && (
                  <span aria-hidden className="ml-0.5">
                    {direction === "up" ? "↑" : "↓"}
                  </span>
                )}
              </span>
            )}
            {compare && <span className="text-white/45">{compare}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The tile's mark: a filled silhouette with a stroked outline over it, which
 * is what gives these weight at 60px where a plain 1.8px stroke would look
 * like a line drawing that had wandered in from the rail.
 */
function Glyph({ name }: { name: StatIcon }) {
  const common = {
    width: 74,
    height: 74,
    viewBox: "0 0 24 24",
    className: "opacity-90",
  };
  const line = {
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  const solid = { fill: "currentColor", opacity: 0.22 };

  if (name === "users") {
    return (
      <svg {...common}>
        <circle cx="9.2" cy="8" r="3.4" {...solid} />
        <path d="M3 19.6c1-3.5 3.4-5.2 6.2-5.2s5.2 1.7 6.2 5.2z" {...solid} />
        <circle cx="9.2" cy="8" r="3.4" {...line} />
        <path d="M3 19.6c1-3.5 3.4-5.2 6.2-5.2s5.2 1.7 6.2 5.2" {...line} />
        <path d="M16.4 5.6a3.3 3.3 0 0 1 0 4.9" {...line} />
        <path d="M18.1 14.8c1.4.8 2.4 2.3 2.9 4.8" {...line} />
      </svg>
    );
  }
  if (name === "sessions") {
    // A pulse, and only a pulse. It carried a power symbol behind the trace
    // as well, and the two crossing each other at this size read as a scribble
    // rather than as either of them.
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.8" {...solid} />
        <circle cx="12" cy="12" r="8.8" {...line} />
        <path d="M4.2 12.2h2.9l1.7-3.4 2.6 6.9 2-4.1 1.2 2.3h3.2" {...line} />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...common}>
        <path d="M5 3.6h14v17l-3.5-2.1-3.5 2.1-3.5-2.1L5 20.6z" {...solid} />
        <path d="M5 3.6h14v17l-3.5-2.1-3.5 2.1-3.5-2.1L5 20.6z" {...line} />
        <path d="M8.6 8.6h6.8M8.6 12.4h4.2" {...line} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M18.4 9.4a6.4 6.4 0 1 0-12.8 0c0 6.4-2.1 7.5-2.1 7.5h17s-2.1-1.1-2.1-7.5z" {...solid} />
      <path d="M18.4 9.4a6.4 6.4 0 1 0-12.8 0c0 6.4-2.1 7.5-2.1 7.5h17s-2.1-1.1-2.1-7.5z" {...line} />
      <path d="M13.9 20.1a2.2 2.2 0 0 1-3.8 0" {...line} />
    </svg>
  );
}
