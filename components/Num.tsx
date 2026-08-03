/**
 * Money and percentage figures, with the whole number set heavier and larger
 * than the decimals so a column of them scans at a glance.
 */
function split(value: number, digits: number): { whole: string; frac: string } {
  const text = Math.abs(value).toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const dot = text.lastIndexOf(".");
  return dot === -1
    ? { whole: text, frac: "" }
    : { whole: text.slice(0, dot), frac: text.slice(dot) };
}

export default function Num({
  value,
  digits = 2,
  suffix = "",
  showSign = false,
  className = "",
}: {
  value: number;
  digits?: number;
  suffix?: string;
  /** Force a leading + on non-negative values (gains, changes). */
  showSign?: boolean;
  className?: string;
}) {
  const { whole, frac } = split(value, digits);
  const sign = value < 0 ? "−" : showSign ? "+" : "";

  return (
    <span className={`tabular-nums ${className}`}>
      <span className="font-bold">
        {sign}
        {whole}
      </span>
      <span className="text-[0.82em] font-medium">
        {frac}
        {suffix}
      </span>
    </span>
  );
}

/** Percentage with an up/down arrow and the positive/negative colour applied. */
export function Pct({
  value,
  digits = 2,
  className = "",
}: {
  value: number | null;
  digits?: number;
  className?: string;
}) {
  if (value === null || Number.isNaN(value)) {
    return <span className={`text-app-muted ${className}`}>—</span>;
  }
  const tone = value >= 0 ? "text-app-positive" : "text-app-negative";
  return (
    <span className={`${tone} ${className}`}>
      <span className="text-[0.82em]">{value >= 0 ? "▲" : "▼"} </span>
      <Num value={value} digits={digits} suffix="%" />
    </span>
  );
}
