export type StatIcon = "users" | "sessions" | "orders" | "alerts";

/**
 * One figure, in four parts: what it counts, the count, how it moved, and
 * what it was before.
 *
 * The last of those is the one most dashboards leave out, and it is the one
 * that makes a change mean anything — "+7.5%" against a base nobody states
 * could be six accounts or six hundred. The previous figure goes at the foot
 * of the card in words, so the percentage above it never has to be trusted on
 * its own.
 *
 * The change is a chip rather than a sentence: green when the count went up,
 * red when it went down, and grey when there is nothing to compare against.
 * Direction only — none of these metrics is good or bad news, so the colour
 * says which way, not whether.
 *
 * `primary` fills one card in the row. A row of four identical white cards
 * has no entry point; filling the first gives the eye somewhere to start and
 * marks the figure the section is mostly about.
 */
export default function StatCard({
  label,
  value,
  delta,
  direction = "flat",
  previous,
  icon,
  primary,
  badge = "brand",
}: {
  label: string;
  value: React.ReactNode;
  /** Short, e.g. "7.5%". The arrow comes from `direction`. */
  delta?: string;
  direction?: "up" | "down" | "flat";
  /** What it was, e.g. "Өмнөх 7 хоног: 89". */
  previous?: React.ReactNode;
  icon: StatIcon;
  primary?: boolean;
  /** The badge is brand green unless a row needs one that is not. */
  badge?: "brand" | "ink";
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-col justify-between gap-4 p-5 ${
        primary ? "rounded-2xl" : ""
      }`}
      style={
        primary
          ? {
              background:
                "linear-gradient(142deg, var(--admin-fill-from), var(--admin-fill-to))",
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={`text-sm font-medium ${primary ? "text-white/85" : "text-app-muted"}`}
        >
          {label}
        </span>
        <span
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={
            primary
              ? { backgroundColor: "#ffffff", color: "var(--admin-fill-to)" }
              : badge === "ink"
                ? { backgroundColor: "var(--admin-ink)", color: "#ffffff" }
                : {
                    background:
                      "linear-gradient(150deg, var(--admin-fill-from), var(--admin-fill-to))",
                    color: "#ffffff",
                  }
          }
        >
          <Glyph name={icon} />
        </span>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className={`text-[30px] leading-none font-bold tracking-[-0.03em] tabular-nums lg:text-[34px] ${
              primary ? "text-white" : "text-app-text"
            }`}
          >
            {value}
          </span>
          {delta && <DeltaChip delta={delta} direction={direction} primary={primary} />}
        </div>
        {previous && (
          <div
            className={`mt-3 text-[13px] ${primary ? "text-white/75" : "text-app-muted"}`}
          >
            {previous}
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaChip({
  delta,
  direction,
  primary,
}: {
  delta: string;
  direction: "up" | "down" | "flat";
  primary?: boolean;
}) {
  const tone = primary
    ? "bg-white/20 text-white"
    : direction === "up"
      ? "bg-app-positive-bg text-app-positive"
      : direction === "down"
        ? "bg-app-negative-bg text-app-negative"
        : "bg-app-elevated text-app-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${tone}`}
    >
      {direction !== "flat" && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d={direction === "up" ? "M6 9.5V2.5M2.8 5.7 6 2.5l3.2 3.2" : "M6 2.5v7M2.8 6.3 6 9.5l3.2-3.2"}
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

/** The mark in the badge: one stroke weight, sized for a 44px circle. */
function Glyph({ name }: { name: StatIcon }) {
  const line = {
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  const size = { width: 20, height: 20, viewBox: "0 0 24 24" };

  if (name === "users") {
    return (
      <svg {...size}>
        <circle cx="9.5" cy="8" r="3.3" {...line} />
        <path d="M3.6 19.4c1-3.4 3.3-5 5.9-5s4.9 1.6 5.9 5" {...line} />
        <path d="M16.6 5.6a3.2 3.2 0 0 1 0 4.8" {...line} />
        <path d="M18.2 14.7c1.3.8 2.2 2.2 2.7 4.5" {...line} />
      </svg>
    );
  }
  if (name === "sessions") {
    return (
      <svg {...size}>
        <circle cx="12" cy="12" r="8.6" {...line} />
        <path d="M4.3 12.2h2.8l1.7-3.3 2.5 6.7 2-4 1.2 2.2h3.1" {...line} />
      </svg>
    );
  }
  if (name === "orders") {
    return (
      <svg {...size}>
        <path d="M5.2 3.8h13.6v16.4l-3.4-2-3.4 2-3.4-2-3.4 2z" {...line} />
        <path d="M8.7 8.6h6.6M8.7 12.3h4.1" {...line} />
      </svg>
    );
  }
  return (
    <svg {...size}>
      <path d="M18.2 9.4a6.2 6.2 0 1 0-12.4 0c0 6.2-2 7.3-2 7.3h16.4s-2-1.1-2-7.3Z" {...line} />
      <path d="M13.8 20a2.1 2.1 0 0 1-3.6 0" {...line} />
    </svg>
  );
}
