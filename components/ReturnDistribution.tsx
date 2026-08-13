import type { TdbReturnDistribution } from "@/lib/tdb/datalab";

/**
 * What one day in this share has actually looked like.
 *
 * The risk panel above states a spread; this draws its shape, which is the
 * thing a standard deviation cannot say. They are rarely symmetrical — one
 * bank's worst session in the year was -15.5% against a best of +3.8% around
 * a daily deviation of 1.26% — and a reader who has only seen the deviation
 * has no way to know that.
 *
 * TDB Securities' own arithmetic over their own window, stated rather than
 * recomputed here, which is why the footer says whose figures these are and
 * how many sessions they cover.
 */

function pct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export default function ReturnDistribution({
  distribution,
}: {
  distribution: TdbReturnDistribution;
}) {
  const { histogram } = distribution;
  const tallest = Math.max(...histogram.map((b) => b.count), 1);

  const stats = [
    { label: "Өдрийн хэлбэлзэл", value: pct(distribution.dailyStdDev) },
    { label: "Жилийн хэлбэлзэл", value: pct(distribution.annualStdDev, 1) },
    { label: "Хамгийн муу өдөр", value: pct(distribution.minPct) },
    { label: "Хамгийн сайн өдөр", value: pct(distribution.maxPct) },
  ];

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text">
          Өдрийн өгөөжийн тархалт
        </h2>
        <span className="text-[10px] text-app-muted">
          {distribution.sessions} арилжааны өдөр
        </span>
      </div>

      {histogram.length > 0 && (
        <>
          {/* Bars share one baseline and keep their empty buckets, so the
              gaps between clusters are as visible as the clusters. */}
          <div className="flex h-24 items-end gap-px" aria-hidden="true">
            {histogram.map((bucket) => (
              <div
                key={bucket.bucket}
                title={`${pct(bucket.bucket)}: ${bucket.count} өдөр`}
                className={`flex-1 rounded-t-sm ${
                  bucket.bucket < 0 ? "bg-app-negative/70" : "bg-app-positive/70"
                }`}
                // A bucket with no sessions still holds its place in the row,
                // so a hairline stands where the bar would be.
                style={{ height: `${Math.max((bucket.count / tallest) * 100, 1.5)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] tabular-nums text-app-muted">
            <span>{pct(histogram[0].bucket, 1)}</span>
            <span>{pct(histogram.at(-1)!.bucket, 1)}</span>
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-app-bg p-2.5">
            <div className="text-[10px] text-app-muted">{stat.label}</div>
            <div className="text-sm font-semibold tabular-nums text-app-text">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {distribution.worst1Sigma !== null && distribution.best1Sigma !== null && (
        <p className="mt-3 text-[10px] text-app-muted">
          Гурван өдрийн хоёрт нь өдрийн өөрчлөлт{" "}
          <span className="tabular-nums text-app-text">
            {pct(distribution.worst1Sigma)} … {pct(distribution.best1Sigma)}
          </span>{" "}
          хооронд байсан. Эх сурвалж: TDB Securities Datalab.
        </p>
      )}
    </div>
  );
}
