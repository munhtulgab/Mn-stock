/**
 * One figure and what it is.
 *
 * The admin area is mostly counts, and a card rebuilt at each call site is a
 * card that drifts by the fourth one. The figure is the largest thing on it
 * and set in tabular numerals, so four of them side by side read as a row of
 * numbers rather than as four paragraphs that happen to contain one.
 *
 * The change beside it is a chip rather than a sentence: what an
 * administrator wants from a dashboard at a glance is the direction, and a
 * direction that has to be read word by word is not a glance.
 */
export default function StatCard({
  label,
  value,
  delta,
  deltaTone = "up",
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  /** Short, e.g. "+6". Omitted when there is nothing to compare against. */
  delta?: string;
  deltaTone?: "up" | "flat";
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="lift rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-app-elevated text-app-muted">
            {icon}
          </span>
        )}
        <span className="text-xs font-medium text-app-muted">{label}</span>
      </div>
      <div className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-app-text">
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-2.5 flex items-center gap-2">
          {delta && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                deltaTone === "up"
                  ? "bg-app-positive-bg text-app-positive"
                  : "bg-app-elevated text-app-muted"
              }`}
            >
              {delta}
            </span>
          )}
          {hint && <span className="text-[11px] text-app-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
