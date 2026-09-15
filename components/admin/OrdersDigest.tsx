import Link from "next/link";
import { WEEKDAYS_SHORT } from "@/lib/day";
import { compactTugrug } from "@/lib/tugrug";
import { byWeekday, sumDays, type DailyOrders } from "@/lib/adminOverview";

/**
 * A quarter of orders on one card: what they came to, which way they went,
 * and which days of the week this installation actually trades on.
 *
 * The four tiles at the top of the dashboard are totals — how many orders
 * have ever been placed — and a total answers "how big is this" and nothing
 * about the shape of it. This answers the shape, three ways, and each in the
 * form that suits what it is:
 *
 *  - The ring is the buy/sell split, because a ring is for a part of a whole
 *    and this is the only true one on the page. Two arcs rather than one
 *    against a track: both halves are real, and drawing the smaller as
 *    "what is missing" would be a claim that a selling quarter is a shortfall.
 *  - The figure beside it is money, because turnover is the one number that
 *    does not care whether a quarter was a thousand small orders or ten large
 *    ones. Its curve is the same window, so the figure has a shape as well as
 *    a size — quiet days left out, since a day nobody traded is not a dip in
 *    what was traded, and ninety columns with thirty blanks among them spend
 *    a third of the width saying nothing.
 *  - The bars are a quarter laid over one week. Ninety columns say what
 *    happened; seven say what happens — that Thursday is the day this
 *    installation trades on and Sunday is not a day at all.
 *
 * Every figure is derived from the same `daily` window the activity strip
 * above it plots, plus the side split that a day's total cannot carry.
 * Nothing here is counted a second way.
 */
export default function OrdersDigest({
  days,
  buys,
  sells,
  previousTurnover,
}: {
  /** Every day of the window in order, quiet ones included. */
  days: DailyOrders[];
  /** How the window's orders split, which a day's total does not say. */
  buys: number;
  sells: number;
  /** The same length of time before this window, for the change chip. */
  previousTurnover: number;
}) {
  const { orders, turnover } = sumDays(days);
  const traded = days.filter((d) => d.count > 0);
  const week = byWeekday(days);
  const sided = buys + sells;
  const busiest = week.indexOf(Math.max(...week));

  return (
    // A column filling its half of the row, so that when the strip beside it
    // is the taller of the two the difference goes above the three tiles
    // rather than under them, where it would read as the card stopping short.
    <section className="flex h-full flex-col rounded-2xl border border-app-border bg-app-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Tile size={42}>
          <TrendGlyph />
        </Tile>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-tight font-semibold tracking-[-0.015em] text-app-text">
            Захиалгын тойм
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-app-muted">
            Сүүлийн {days.length} хоног · {stretch(days)}
          </p>
        </div>
        {/* Where the figures came from. A menu with nothing in it is
            furniture; the one thing anybody wants from this card is the rows
            behind it. */}
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
        <SideRing buys={buys} sells={sells} />

        <div className="flex min-w-0 flex-col rounded-2xl border border-app-border p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Tile size={38}>
              <CoinGlyph />
            </Tile>
            <p className="min-w-0 text-[15px] text-app-muted">
              <span className="text-[17px] font-bold text-app-text tabular-nums">
                {compactTugrug(turnover)}
              </span>{" "}
              захиалгын дүн
            </p>
            <span className="ml-auto shrink-0">
              <Change now={turnover} before={previousTurnover} />
            </span>
          </div>

          <Curve days={traded} window={days.length} />

          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 text-app-muted">
              <ClockGlyph />
              <span className="truncate">
                Арилжаатай {traded.length.toLocaleString("mn-MN")} өдөр
              </span>
            </span>
            <span className="shrink-0 font-semibold text-brand">
              {orders.toLocaleString("mn-MN")} захиалга
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
            <p className="mt-0.5 text-[12px] leading-tight text-app-muted">
              {days.length} хоногийн захиалга, гараг тус бүрээр
            </p>
          </div>
          {orders > 0 && <Busiest weekday={busiest} />}
        </div>

        <DayBars counts={week} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3 lg:mt-auto lg:pt-3">
        <Fact label="Захиалга" tone="brand" icon={<OrderGlyph />}>
          {orders.toLocaleString("mn-MN")}
        </Fact>
        <Fact
          label="Авсан"
          tone="positive"
          icon={<UpGlyph />}
          note={sided > 0 ? `${Math.round((buys / sided) * 100)}%` : undefined}
        >
          {buys.toLocaleString("mn-MN")}
        </Fact>
        <Fact
          label="Зарсан"
          tone="negative"
          icon={<DownGlyph />}
          note={sided > 0 ? `${Math.round((sells / sided) * 100)}%` : undefined}
        >
          {sells.toLocaleString("mn-MN")}
        </Fact>
      </div>
    </section>
  );
}

/** "6 сарын 18 – 9 сарын 15", so the window is dated rather than just named. */
function stretch(days: DailyOrders[]): string {
  if (days.length === 0) return "";
  const say = (day: string) =>
    `${Number(day.slice(5, 7))} сарын ${Number(day.slice(8, 10))}`;
  return `${say(days[0].day)} – ${say(days[days.length - 1].day)}`;
}

/**
 * The buy/sell split, drawn as the two parts of a circle it is.
 *
 * Green for bought and red for sold, the same two colours the АВСАН and
 * ЗАРСАН pills use in every table on this sheet — the ring is then read
 * without a legend, and a reader who has seen one has seen the other.
 *
 * Rotated a quarter turn so the first arc starts at twelve o'clock, and cut
 * by a hairline at each join so two segments never read as one. Butt caps,
 * not round: rounded ends on adjacent arcs overlap, and the overlap lands
 * exactly where the eye is measuring the split.
 */
function SideRing({ buys, sells }: { buys: number; sells: number }) {
  const SIZE = 148;
  const STROKE = 13;
  const radius = (SIZE - STROKE) / 2;
  const circle = 2 * Math.PI * radius;
  const total = buys + sells;
  const share = total > 0 ? buys / total : 0;
  const pct = Math.round(share * 100);

  // A hairline at each join. Taken off both arcs so the two gaps are equal,
  // and the whole thing turned by half of one so they sit symmetrically.
  const gap = circle * 0.012;
  const gapDeg = (gap / circle) * 360;
  const arc = (part: number) => Math.max(0, circle * part - gap);

  return (
    <div
      className="relative mx-auto grid shrink-0 place-items-center sm:mx-0"
      style={{ width: SIZE, height: SIZE }}
      title={
        total > 0
          ? `${buys.toLocaleString("mn-MN")} авсан · ${sells.toLocaleString("mn-MN")} зарсан`
          : "Захиалга алга"
      }
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        {total === 0 ? (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            fill="none"
            strokeWidth={STROKE}
            style={{ stroke: "var(--app-elevated)" }}
          />
        ) : (
          <>
            <Arc
              size={SIZE}
              radius={radius}
              stroke={STROKE}
              length={arc(share)}
              circle={circle}
              at={-90 + gapDeg / 2}
              colour="var(--app-positive)"
            />
            <Arc
              size={SIZE}
              radius={radius}
              stroke={STROKE}
              length={arc(1 - share)}
              circle={circle}
              at={-90 + share * 360 + gapDeg / 2}
              colour="var(--app-negative)"
            />
          </>
        )}
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="text-[30px] leading-none font-bold tracking-[-0.03em] text-app-text tabular-nums">
          {total > 0 ? `${pct}%` : "—"}
        </span>
        <span className="mt-1 text-[13px] font-semibold text-app-positive">
          {total > 0 ? "Авсан" : "Захиалга алга"}
        </span>
      </div>
    </div>
  );
}

function Arc({
  size,
  radius,
  stroke,
  length,
  circle,
  at,
  colour,
}: {
  size: number;
  radius: number;
  stroke: number;
  length: number;
  circle: number;
  /** Degrees clockwise from twelve o'clock. */
  at: number;
  colour: string;
}) {
  if (length <= 0) return null;
  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      strokeWidth={stroke}
      strokeDasharray={`${length.toFixed(2)} ${circle.toFixed(2)}`}
      transform={`rotate(${at.toFixed(2)} ${size / 2} ${size / 2})`}
      style={{ stroke: colour }}
    />
  );
}

/**
 * This window against the one before it, as a percentage with a direction.
 *
 * Nothing rather than a number when there is no base: a quarter that went
 * from no trading at all to some trading is not "+∞%", and printing the
 * arithmetic anyway is how a dashboard ends up showing Infinity on its
 * second day.
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
      title="Өмнөх 90 хоногтой харьцуулсан"
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
 * The window's money as a filled curve, one point a trading day.
 *
 * The quiet days are not points. An exchange is shut two days in seven and on
 * every public holiday, so a third of the window is legitimately empty — and
 * plotted as zeroes the curve spends that third at the floor, which reads as
 * a collapse in trading rather than as a weekend.
 *
 * Stretched to whatever width it is given rather than measured, which is what
 * `preserveAspectRatio="none"` is for; the stroke is told not to stretch with
 * it, or a wide card draws a hairline and a narrow one draws a rope.
 */
function Curve({ days, window }: { days: DailyOrders[]; window: number }) {
  const H = 46;
  const W = 100;
  const peak = Math.max(...days.map((d) => d.turnover), 0);

  if (days.length === 0 || peak <= 0) {
    return (
      <div className="my-3 flex h-[46px] items-center justify-center rounded-xl border border-dashed border-app-border text-[12px] text-app-muted">
        Сүүлийн {window} хоногт арилжаа болоогүй
      </div>
    );
  }

  const step = days.length > 1 ? W / (days.length - 1) : W;
  const points = days.map(
    (d, i) => [i * step, H - 2 - (d.turnover / peak) * (H - 5)] as const,
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
      aria-label={`Өдрийн захиалгын дүн, арилжаатай ${days.length} өдөр. Хамгийн их ${compactTugrug(peak)}.`}
    >
      <defs>
        <linearGradient id="orders-curve" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--admin-fill-from)" }} stopOpacity="0.26" />
          <stop offset="1" style={{ stopColor: "var(--admin-fill-from)" }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#orders-curve)" />
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
 * Seven columns, Monday to Sunday: the count above, the day under it.
 *
 * Each bar is a filled part of a full-height track rather than a bar on a
 * baseline. Seven free-standing bars of wildly different heights read as a
 * ragged edge; the track gives every day the same frame, so what is being
 * compared is how full each one is.
 *
 * The busiest is picked out because that is the one fact a profile like this
 * exists to state, and a column that looks like the six beside it cannot
 * state it.
 */
function DayBars({ counts }: { counts: number[] }) {
  const peak = Math.max(...counts, 1);
  const busiest = counts.indexOf(peak);

  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
      {counts.map((n, i) => {
        const top = i === busiest && n > 0;
        return (
          <div
            key={WEEKDAYS_SHORT[i]}
            className="flex min-w-0 flex-col items-center gap-2"
            title={`${WEEKDAYS_SHORT[i]} гараг · ${n.toLocaleString("mn-MN")} захиалга`}
          >
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                top ? "text-brand" : n > 0 ? "text-app-text" : "text-app-muted"
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
              className={`text-[11px] ${top ? "font-semibold text-brand" : "text-app-muted"}`}
            >
              {WEEKDAYS_SHORT[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Which day of the week this installation trades on, said in words. */
function Busiest({ weekday }: { weekday: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-[12px] font-semibold text-brand">
      <BoltGlyph />
      {WEEKDAYS_SHORT[weekday]} гараг
    </span>
  );
}

const FACT_TONES = {
  brand: "bg-brand-light text-brand",
  positive: "bg-app-positive-bg text-app-positive",
  negative: "bg-app-negative-bg text-app-negative",
} as const;

function Fact({
  label,
  tone,
  icon,
  note,
  children,
}: {
  label: string;
  tone: keyof typeof FACT_TONES;
  icon: React.ReactNode;
  /** A share, set beside the count rather than instead of it. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    // The mark goes above the words on a phone rather than beside them. Set
    // beside, the text had about fifty pixels to live in, and "190" and its
    // "62%" wrapped onto two lines in two of the three tiles — which left
    // the three figures on three different baselines, reading as three
    // different kinds of thing. Above, the row is as wide as the tile and
    // they all fit on one line.
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-app-border p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${FACT_TONES[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] leading-tight text-app-muted">{label}</div>
        <div className="mt-1 flex items-baseline gap-x-1.5 text-[18px] leading-none font-bold text-app-text tabular-nums">
          <span data-figure>{children}</span>
          {note && <span className="text-[12px] font-semibold text-app-muted">{note}</span>}
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

function OrderGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <path d="M5.5 4h13v16l-3.2-1.9-3.3 1.9-3.3-1.9L5.5 20z" />
      <path d="M9 9h6M9 12.6h3.8" />
    </svg>
  );
}

function UpGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function DownGlyph() {
  return (
    <svg {...GLYPH} width={16} height={16}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
