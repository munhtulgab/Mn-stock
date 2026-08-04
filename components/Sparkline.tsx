/**
 * Small inline price trend, drawn next to a symbol in the dashboard table.
 * Plain SVG rather than recharts: the table can render 200+ rows at once,
 * and a chart lib's per-instance overhead isn't worth it at this size.
 */
export default function Sparkline({
  data,
  positive,
  width = 56,
  height = 24,
}: {
  /**
   * Optional/possibly-missing: rows served from a snapshot cached before this
   * field existed won't have it until the cache refreshes.
   */
  data: (number | null)[] | undefined | null;
  /** Stroke colour: green when true, red when false. */
  positive: boolean;
  width?: number;
  height?: number;
}) {
  const values = (data ?? []).filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );

  if (values.length < 2) {
    return <div style={{ width, height }} className="shrink-0" aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const color = positive ? "#00d16c" : "#ff5a5f";
  const gradientId = `spark-fill-${positive ? "up" : "down"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
