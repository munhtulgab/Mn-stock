import Num, { Pct } from "./Num";
import type { TdbProfile } from "@/lib/tdb/datalab";

/**
 * The year around the price: its range, its return, what usually changes
 * hands, and how much of the company can.
 *
 * All stated by Datalab rather than worked out from the candles this app
 * holds — which matters most for the 52-week range, where a computed high is
 * only as complete as the history behind it, and for the free float, which
 * is not derivable from prices at all.
 */

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-app-bg p-2.5">
      <div className="text-[10px] text-app-muted">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-app-text">{value}</div>
      {hint && <div className="text-[9px] leading-tight text-app-muted mt-0.5">{hint}</div>}
    </div>
  );
}

/** Tugriks at the scale a listed company is valued in. */
function Money({ value }: { value: number }) {
  if (Math.abs(value) >= 1_000_000_000) {
    return <Num value={value / 1_000_000_000} digits={1} suffix="тэрбум" />;
  }
  if (Math.abs(value) >= 1_000_000) {
    return <Num value={value / 1_000_000} digits={1} suffix="сая" />;
  }
  return <Num value={value} digits={0} />;
}

export default function YearPanel({
  profile,
  price,
}: {
  profile: TdbProfile;
  /** Today's price, to place it inside the year's range. */
  price: number | null;
}) {
  const { high52w, low52w } = profile;
  // Where in the year's range today sits, as a percentage of the band.
  const position =
    high52w !== null && low52w !== null && price !== null && high52w > low52w
      ? ((price - low52w) / (high52w - low52w)) * 100
      : null;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text">Жилийн үзүүлэлт</h2>
        <span className="text-[10px] text-app-muted">TDB Datalab</span>
      </div>

      {high52w !== null && low52w !== null && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between text-[11px] tabular-nums">
            <span className="text-app-muted">
              <Num value={low52w} digits={2} />
            </span>
            <span className="text-[10px] text-app-muted">52 долоо хоногийн муж</span>
            <span className="text-app-muted">
              <Num value={high52w} digits={2} />
            </span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-app-bg">
            {position !== null && (
              // Clamped: a price outside the stated range would otherwise put
              // the marker off the end of its own track.
              <div
                className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-brand"
                style={{ left: `${Math.min(Math.max(position, 0), 100)}%` }}
              />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {profile.yearlyReturn !== null && (
          <Fact
            label="Жилийн өгөөж"
            value={<Pct value={profile.yearlyReturn} />}
            hint="Сүүлийн 12 сар"
          />
        )}
        {profile.yearlyStdDev !== null && (
          <Fact
            label="Жилийн хэлбэлзэл"
            value={`${profile.yearlyStdDev.toFixed(1)}%`}
            hint="Их бол эрсдэл өндөр"
          />
        )}
        {profile.avgVolume !== null && (
          <Fact
            label="Дундаж эзлэхүүн"
            value={<Num value={profile.avgVolume} digits={0} />}
            hint="Өдөрт, ширхэгээр"
          />
        )}
        {profile.yearVolume !== null && (
          <Fact
            label="Жилийн эзлэхүүн"
            value={<Num value={profile.yearVolume} digits={0} />}
            hint="Ширхэгээр"
          />
        )}
        {profile.marketCap !== null && (
          <Fact label="Зах зээлийн үнэлгээ, ₮" value={<Money value={profile.marketCap} />} />
        )}
        {profile.freeFloatPct !== null && (
          <Fact
            label="Чөлөөт эргэлт"
            value={`${profile.freeFloatPct.toFixed(2)}%`}
            hint="Олон нийтэд байгаа хувь"
          />
        )}
        {/* Only where it is positive. Enterprise value is capitalisation plus
            net debt, and a bank funded by deposits holds more cash than debt
            — Хаан банк comes back at -3.4 trillion, which is arithmetic
            rather than an error but is not a valuation anybody can use. */}
        {profile.enterpriseValue !== null && profile.enterpriseValue > 0 && (
          <Fact
            label="Аж ахуйн нэгжийн үнэлгээ, ₮"
            value={<Money value={profile.enterpriseValue} />}
            hint="Үнэлгээ + цэвэр өр"
          />
        )}
      </div>
    </div>
  );
}
