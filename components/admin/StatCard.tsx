/**
 * One figure and what it is. The admin area is mostly counts, and a card that
 * has to be rebuilt at each call site is a card that drifts by the fourth one.
 */
export default function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="text-xs text-app-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-app-text">{value}</div>
      {hint && <div className="mt-1 text-xs text-app-muted">{hint}</div>}
    </div>
  );
}
