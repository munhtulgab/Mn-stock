/**
 * One stroked 24px icon set, addressed by name rather than by import.
 *
 * The controls that need these — a dropdown whose every option carries a
 * mark, a filter bar, a calendar — are handed their icons as data. A filter
 * list lives in `lib/adminFilters.ts`, which is read on the server as well
 * as in the browser and so cannot hold JSX; a name is a string and travels
 * anywhere. This module is the one place that turns the name back into a
 * drawing, which also keeps the marks a single family instead of one shape
 * per component.
 *
 * All of them are drawn on the same 24 grid at the same weight, so a row of
 * them lines up without anything being nudged.
 */

export type GlyphName =
  // Chrome
  | "sliders"
  | "search"
  | "close"
  | "chevron"
  | "chevronUp"
  | "chevronLeft"
  | "chevronRight"
  | "menu"
  | "check"
  // Filters and their options
  | "shield"
  | "user"
  | "users"
  | "receipt"
  | "noReceipt"
  | "calendar"
  | "calendarClock"
  | "clock"
  | "history"
  | "infinity"
  | "swap"
  | "tag"
  | "arrowDown"
  | "arrowUp"
  | "import"
  | "hand"
  | "refresh"
  | "pencil";

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<GlyphName, React.ReactNode> = {
  sliders: (
    <>
      <path d="M4 7.5h5.5M13.5 7.5H20M4 16.5h7.5M15.5 16.5H20" />
      <circle cx="11.5" cy="7.5" r="2.1" />
      <circle cx="13.5" cy="16.5" r="2.1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.4 15.4 4 4" />
    </>
  ),
  close: <path d="m6.8 6.8 10.4 10.4M17.2 6.8 6.8 17.2" />,
  chevron: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronUp: <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />,
  chevronLeft: <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  menu: <path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" />,
  check: <path d="m5.5 12.4 4.3 4.3 8.7-9.4" />,
  shield: (
    <>
      <path d="M12 3.4 5 6v5.6c0 4 2.8 7.4 7 9 4.2-1.6 7-5 7-9V6z" />
      <path d="m9.2 11.9 2 2 3.6-3.8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5 19.4c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" />
    </>
  ),
  users: (
    <>
      <circle cx="9.6" cy="8.4" r="3.2" />
      <path d="M3.6 19.2c1-2.9 3.2-4.4 6-4.4s5 1.5 6 4.4" />
      <path d="M16.2 5.6a3.2 3.2 0 0 1 0 5.6M17.4 14.9c2 .5 3.4 1.9 4.1 4.3" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.8 3.8h12.4v16.4l-3.1-1.9-3.1 1.9-3.1-1.9-3.1 1.9z" />
      <path d="M9 8.6h6M9 12.2h3.6" />
    </>
  ),
  noReceipt: (
    <>
      <path d="M5.8 3.8h12.4v16.4l-3.1-1.9-3.1 1.9-3.1-1.9-3.1 1.9z" />
      <path d="m4.4 4.4 15.2 15.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.8" y="5.4" width="16.4" height="14.8" rx="2.6" />
      <path d="M3.8 10h16.4M8.4 3.4v3.4M15.6 3.4v3.4" />
    </>
  ),
  calendarClock: (
    <>
      <path d="M20.2 11.4V8a2.6 2.6 0 0 0-2.6-2.6H6.4A2.6 2.6 0 0 0 3.8 8v9.6a2.6 2.6 0 0 0 2.6 2.6h4.6" />
      <path d="M3.8 10h16.4M8.4 3.4v3.4M15.6 3.4v3.4" />
      <circle cx="17.4" cy="17.4" r="4.2" />
      <path d="M17.4 15.6v1.9l1.3 1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.2V12l3.2 2.2" />
    </>
  ),
  history: (
    <>
      <path d="M3.9 12a8.1 8.1 0 1 0 2.5-5.8" />
      <path d="M3.6 4.4v4.2h4.2" />
      <path d="M12 7.6V12l3 1.9" />
    </>
  ),
  infinity: (
    <path d="M7.1 8.4c2 0 2.9 1.4 4.9 3.6s2.9 3.6 4.9 3.6a3.6 3.6 0 0 0 0-7.2c-2 0-2.9 1.4-4.9 3.6s-2.9 3.6-4.9 3.6a3.6 3.6 0 0 1 0-7.2z" />
  ),
  swap: <path d="M7.5 4.5v13M4.2 14.2l3.3 3.3 3.3-3.3M16.5 19.5v-13M13.2 9.8l3.3-3.3 3.3 3.3" />,
  tag: (
    <>
      <path d="M11.2 3.6H20v8.8l-8.4 8.4-8.8-8.8z" />
      <circle cx="16.1" cy="7.9" r="1.5" />
    </>
  ),
  arrowDown: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.9v8.2M8.6 12.7 12 16.1l3.4-3.4" />
    </>
  ),
  arrowUp: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 16.1V7.9M8.6 11.3 12 7.9l3.4 3.4" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.6v10.2M8.2 10l3.8 3.8 3.8-3.8" />
      <path d="M4.4 15.4v2.6a2.4 2.4 0 0 0 2.4 2.4h10.4a2.4 2.4 0 0 0 2.4-2.4v-2.6" />
    </>
  ),
  hand: (
    <>
      <path d="M9.4 11V5.6a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M12.6 11V7.4a1.6 1.6 0 0 1 3.2 0V13" />
      <path d="M15.8 11.4a1.6 1.6 0 0 1 3.2 0v3.2c0 3.3-2.4 5.8-5.6 5.8-2.6 0-4-1-5.2-2.8l-2.4-3.8a1.6 1.6 0 0 1 2.6-1.8l1.4 1.8" />
      <path d="M9.4 11a1.6 1.6 0 0 0-3.2 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20.4 4.4v4.2h-4.2" />
    </>
  ),
  pencil: (
    <>
      <path d="M4.5 19.5h4l10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10z" />
      <path d="m13.6 7.4 3 3" />
    </>
  ),
};

/**
 * One mark. `size` is the box it draws in — the strokes are not rescaled, so
 * a 14px chevron next to a 16px icon reads as the same pen at two sizes and
 * not as two pens.
 */
export default function Glyph({
  name,
  size = 16,
  className,
}: {
  name: GlyphName;
  size?: number;
  className?: string;
}) {
  return (
    <svg {...LINE} width={size} height={size} className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
