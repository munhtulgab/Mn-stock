import Link from "next/link";
import { weekdayShort } from "@/lib/day";
import { compactTugrug } from "@/lib/tugrug";

/**
 * The last seven days on one card: what the installation did, and whether it
 * did more of it than the week before.
 *
 * The four tiles at the top of the dashboard are totals — how many accounts
 * there are, how many orders have ever been placed — and a total answers
 * "how big is this" and nothing whatever about "what happened lately". The
 * ninety-day strip answers the second question at a season's resolution,
 * which is the wrong grain for the question an administrator actually opens
 * this page with on a Monday morning.
 *
 * So: one week, four different readings of it, each in the form that suits
 * what it is.
 *
 *  - The ring is a share — accounts that traded, out of accounts that exist.
 *    A ring is for a part of a whole and this is the only true one on the
 *    page, which is why nothing else here is drawn as one.
 *  - The figure beside it is money, because turnover is the one number that
 *    does not care whether a week was thirty small orders or one large one.
 *    Its curve is the same seven days, so the figure has a shape as well as
 *    a size.
 *  - The bars are counts, one column a day. Counts and money are deliberately
 *    not plotted together: they move apart, and a reader who has just been
 *    shown one line will read the second as the same thing.
 *  - The three tiles underneath are the week's flat totals, for the reader
 *    who wanted a number rather than a picture.
 *
 * Every figure on it is derived from `week` in `lib/adminOverview.ts`, which
 * is the same seven Ulaanbaatar days the sparklines behind the KPI tiles use.
 * Nothing here is computed a second way.
 */
export default function WeekDigest({
  days,
  orders,
  turnover,
  newUsers,
  alerts,
  previousOrders,
  previousTurnover,
  activeUsers,
  totalUsers,
}: {
  /** `YYYY-MM-DD` in Ulaanbaatar, oldest first. */
  days: string[];
  /** Orders on each of those days. */
  orders: number[];
  /** Tögrög that changed hands on each of those days. */
  turnover: number[];
  /** Accounts opened on each of those days. */
  newUsers: number[];
  /** Alerts sent on each of those days. */
  alerts: number[];
  /** The seven days before this week, for the two change chips. */
  previousOrders: number;
  previousTurnover: number;
  /** Accounts that placed at least one order this week. */
  activeUsers: number;
  totalUsers: number;
}) {
  const weekOrders = sum(orders);
  const weekTurnover = sum(turnover);
  const share = totalUsers > 0 ? activeUsers / totalUsers : 0;

  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Tile size={42}>
          <TrendGlyph />
        </Tile>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.015em] text-app-text">
            Долоо хоногийн тойм
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-app-muted">
            {stretch(days)} · сүүлийн 7 хоног
          </p>
        </div>
        {/* Where the week came from. A menu with nothing in it is furniture;
            the one thing anybody wants from this card is the rows behind it. */}
        <Link
          href="/admin/orders"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-app-border text-app-muted hover:bg-app-elevated hover:text-app-text"
          aria-label="Бүх захиалга"
          title="Бүх захиалга"
        >
          <ArrowGlyph />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Ring
          share={share}
          caption="Идэвхтэй"
          title={`${totalUsers.toLocaleString("mn-MN")} бүртгэлээс ${activeUsers.toLocaleString("mn-MN")} нь энэ долоо хоногт арилжаа хийсэн`}
        />

        <div className="flex min-w-0 flex-col rounded-2xl border border-app-border p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Tile size={38}>
              <CoinGlyph />
            </Tile>
            <p className="min-w-0 text-[15px] text-app-muted">
              <span className="text-[17px] font-bold text-app-text tabular-nums">
                {compactTugrug(weekTurnover)}
              </span>{" "}
              эргэлт
            </p>
            <span className="ml-auto shrink-0">
              <Change now={weekTurnover} before={previousTurnover} />
            </span>
          </div>

          <Curve values={turnover} days={days} />

          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 text-app-muted">
              <ClockGlyph />
              <span className="truncate">Өнөөдрийг оруулсан</span>
            </span>
            <span className="shrink-0 font-semibold text-brand">
              {weekOrders.toLocaleString("mn-MN")} захиалга
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-app-border p-4">
        <div className="flex items-center gap-3">
          <Tile size={38}>
            <BarsGlyph />
          </Tile>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] leading-tight font-semibold text-app-text">
              Өдрийн идэвх
            </h3>
            {/* The bars are scaled to their own busiest day, so the shape
                alone cannot say whether this was a busy week. The week before
                is the sentence that fixes that. */}
            {/* Allowed two lines on a phone. Truncated, the sentence lost
                exactly the half that carries the comparison. */}
            <p className="mt-0.5 text-[12px] leading-tight text-app-muted">
              Захиалгын тоо, өдрөөр · өмнөх 7 хоногт{" "}
              {previousOrders.toLocaleString("mn-MN")}
            </p>
          </div>
          <Badge active={weekOrders > 0} />
        </div>

        <DayBars days={days} counts={orders} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <Fact label="Захиалга" tone="brand" icon={<OrderGlyph />}>
          {weekOrders.toLocaleString("mn-MN")}
        </Fact>
        <Fact label="Шинэ бүртгэл" tone="blue" icon={<PlusGlyph />}>
          {sum(newUsers).toLocaleString("mn-MN")}
        </Fact>
        <Fact label="Мэдэгдэл" tone="violet" icon={<BellGlyph />}>
          {sum(alerts).toLocaleString("mn-MN")}
        </Fact>
      </div>
    </section>
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((n, v) => n + v, 0);
}

/** "9 сарын 8 – 9 сарын 14", so the week is dated rather than just named. */
function stretch(days: string[]): string {
  if (days.length === 0) return "";
  const say = (day: string) => `${Number(day.slice(5, 7))} сарын ${Number(day.slice(8, 10))}`;
  return `${say(days[0])} – ${say(days[days.length - 1])}`;
}

/**
 * A share, drawn as the part of a circle it is.
 *
 * The figure inside is rounded to whole percent and the exact counts are on
 * the title, because "41%" is what this is for — the reader who needs to know
 * it was 7 of 17 is one hover or one glance at the Хэрэглэгч tile away.
 *
 * Rotated a quarter turn so the arc starts at twelve o'clock. A ring that
 * starts at three reads as having already been running for a while.
 */
function Ring({
  share,
  caption,
  title,
}: {
  share: number;
  caption: string;
  title: string;
}) {
  const SIZE = 148;
  const STROKE = 13;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.round(share * 100);

  return (
    <div
      className="relative mx-auto grid shrink-0 place-items-center sm:mx-0"
      style={{ width: SIZE, height: SIZE }}
      title={title}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          {/* The gradient's colours are the sheet's own custom properties, so
              they have to be set as CSS rather than as the presentation
              attribute — `stop-color="var(...)"` is not resolved. */}
          <linearGradient id="week-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--admin-fill-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--admin-fill-to)" }} />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          style={{ stroke: "var(--app-elevated)" }}
        />
        {pct > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            stroke="url(#week-ring)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(circumference * Math.min(share, 1)).toFixed(2)} ${circumference.toFixed(2)}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="text-[30px] leading-none font-bold tracking-[-0.03em] text-app-text tabular-nums">
          {pct}%
        </span>
        <span className="mt-1 text-[13px] font-semibold text-brand">{caption}</span>
      </div>
    </div>
  );
}

/**
 * This week against the one before it, as a percentage with a direction.
 *
 * Nothing rather than a number when there is no base: a week that went from
 * no trading at all to some trading is not "+∞%", and printing the arithmetic
 * anyway is how a dashboard ends up showing Infinity on its second day.
 */
function Change({ now, before }: { now: number; before: number }) {
  if (before <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-app-elevated px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-app-muted">
        {now > 0 ? "Шинэ" : "—"}
      </span>
    );
  }
  const move = ((now - before) / before) * 100;
  const up = move >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${
        up ? "bg-app-positive-bg text-app-positive" : "bg-app-negative-bg text-app-negative"
      }`}
      title="Өмнөх 7 хоногтой харьцуулсан"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d={up ? "M6 9.5V2.5M2.8 5.7 6 2.5l3.2 3.2" : "M6 2.5v7M2.8 6.3 6 9.5l3.2-3.2"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {Math.abs(move) >= 999 ? "999+%" : `${Math.abs(move).toFixed(0)}%`}
    </span>
  );
}

/**
 * The week's money as a filled curve.
 *
 * Stretched to whatever width it is given rather than measured, which is what
 * `preserveAspectRatio="none"` is for; the stroke is told not to stretch with
 * it, or a wide card draws a hairline and a narrow one draws a rope.
 *
 * A line here and bars below on purpose. These are tögrög, which is a
 * quantity that was flowing all week, and those are orders, which are things
 * that happened on particular days — the two shapes say which is which
 * without a legend.
 */
function Curve({ values, days }: { values: number[]; days: string[] }) {
  const H = 46;
  const W = 100;
  const peak = Math.max(...values);

  if (peak <= 0) {
    return (
      <div className="my-3 flex h-[46px] items-center justify-center rounded-xl border border-dashed border-app-border text-[12px] text-app-muted">
        Энэ долоо хоногт арилжаа болоогүй
      </div>
    );
  }

  const step = values.length > 1 ? W / (values.length - 1) : W;
  const points = values.map(
    (v, i) => [i * step, H - 2 - (v / peak) * (H - 5)] as const,
  );
  let line = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mid = ((x0 + x1) / 2).toFixed(2);
    line += ` C${mid} ${y0.toFixed(2)} ${mid} ${y1.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  return (
    <svg
      className="my-3 h-[46px] w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      fill="none"
      role="img"
      aria-label={`Өдрийн эргэлт: ${days
        .map((d, i) => `${weekdayShort(d)} ${compactTugrug(values[i] ?? 0)}`)
        .join(", ")}`}
    >
      <defs>
        <linearGradient id="week-curve" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--admin-fill-from)" }} stopOpacity="0.26" />
          <stop offset="1" style={{ stopColor: "var(--admin-fill-from)" }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#week-curve)" />
      <path
        d={line}
        style={{ stroke: "var(--admin-fill-from)" }}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Seven days, seven columns: the count above, the day under it.
 *
 * Each bar is a filled part of a full-height track rather than a bar on a
 * baseline. Seven free-standing bars of wildly different heights read as a
 * ragged edge; the track gives every day the same frame, so what is being
 * compared is how full each one is.
 *
 * Today is picked out because "is this a good day or is the week already
 * over" is the question the column on the right is being asked, and a column
 * that looks like the six behind it cannot answer it.
 */
function DayBars({ days, counts }: { days: string[]; counts: number[] }) {
  const peak = Math.max(...counts, 1);

  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((day, i) => {
        const n = counts[i] ?? 0;
        const today = i === days.length - 1;
        return (
          <div
            key={day}
            className="flex min-w-0 flex-col items-center gap-2"
            title={`${day} · ${n.toLocaleString("mn-MN")} захиалга`}
          >
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                today ? "text-brand" : n > 0 ? "text-app-text" : "text-app-muted"
              }`}
            >
              {n}
            </span>
            <span className="flex h-[92px] w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-full bg-app-elevated">
              {n > 0 && (
                <span
                  className="w-full rounded-full"
                  style={{
                    // A floor, so a day with one order is a stub rather than
                    // nothing at all — "1" and "0" have to look different.
                    height: `${Math.max(8, (n / peak) * 100)}%`,
                    background:
                      "linear-gradient(180deg, var(--admin-fill-from), var(--admin-fill-to))",
                  }}
                />
              )}
            </span>
            <span
              className={`text-[11px] ${today ? "font-semibold text-brand" : "text-app-muted"}`}
            >
              {weekdayShort(day)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
        active ? "bg-brand-light text-brand" : "bg-app-elevated text-app-muted"
      }`}
    >
      {active ? <BoltGlyph /> : <PauseGlyph />}
      {active ? "Идэвхтэй" : "Чимээгүй"}
    </span>
  );
}

const FACT_TONES = {
  brand: "bg-brand-light text-brand",
  blue: "bg-[#eaf1fe] text-[#1d5fd0]",
  violet: "bg-[#f1ecfe] text-[#6d33d4]",
} as const;

function Fact({
  label,
  tone,
  icon,
  children,
}: {
  label: string;
  tone: keyof typeof FACT_TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-app-border p-3 sm:gap-3 sm:p-3.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${FACT_TONES[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        {/* Two lines of room on a phone whether or not this label needs them,
            so the three figures sit on one line as each other rather than
            stepping down under the longest name. */}
        <div className="min-h-[26px] text-[11px] leading-tight text-app-muted sm:min-h-0">
          {label}
        </div>
        <div className="mt-0.5 text-[18px] leading-none font-bold text-app-text tabular-nums">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The pale square a glyph sits in, at the two sizes this card uses. */
function Tile({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"
      style={{ width: size, height: size, borderRadius: size > 40 ? 13 : 11 }}
    >
      {children}
    </span>
  );
}

const GLYPH = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function TrendGlyph() {
  return (
    <svg {...GLYPH} width={20} height={20}>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15.5 6.5h5v5" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg {...GLYPH} width={17} height={17}>
      <path d="M5 12h13.5M13 6.5l5.5 5.5L13 17.5" />
    </svg>
  );
}

function CoinGlyph() {
  return (
    <svg {...GLYPH} width={17} height={17}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6v8.8M9.6 9.8h4.2a1.8 1.8 0 0 1 0 3.6H9.6" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg {...GLYPH} width={13} height={13} strokeWidth={1.8} className="shrink-0">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3 1.8" />
    </svg>
  );
}

function BarsGlyph() {
  return (
    <svg {...GLYPH} width={17} height={17}>
      <path d="M6.5 16.5v-4M12 16.5v-9M17.5 16.5v-6" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg {...GLYPH} width={13} height={13} strokeWidth={1.9}>
      <path d="M13.2 3.2 5.8 13h5l-.9 7.8L17.3 11h-5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg {...GLYPH} width={13} height={13}>
      <path d="M9.5 6.5v11M14.5 6.5v11" />
    </svg>
  );
}

function OrderGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <path d="M5.5 4h13v16l-3.2-1.9-3.3 1.9-3.3-1.9L5.5 20z" />
      <path d="M9 9h6M9 12.6h3.8" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <circle cx="10" cy="8.2" r="3.3" />
      <path d="M3.8 19c1-3.2 3.3-4.8 6.2-4.8" />
      <path d="M16.5 13.5v6M13.5 16.5h6" />
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <path d="M18 9.4a6 6 0 1 0-12 0c0 5.8-2 6.9-2 6.9h16s-2-1.1-2-6.9Z" />
      <path d="M13.7 19.6a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
