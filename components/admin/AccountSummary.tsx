import Num from "@/components/Num";
import Panel from "@/components/admin/Panel";
import type { AdminUserDetail } from "@/lib/adminUsers";

/**
 * What the account is worth, what it cost, and what it has done.
 *
 * The four figures on top are the ones asked of an account before any other:
 * what is in it, what went into it, what that has made or lost, and that same
 * gain as a share of what was put in. The last two are the same fact twice on
 * purpose — a gain of 340,000₮ is a triumph on a two-million-tögrög account
 * and a rounding error on a hundred-million one, and neither figure says so
 * alone.
 *
 * The valuation is the account holder's own, from the same function behind
 * their portfolio page, so an administrator reading this and the reader
 * reading theirs are looking at one number rather than two.
 *
 * Each line carries a mark. Eight rows of label-and-value are eight rows the
 * eye has to read in order; a glyph at the head of each is what lets the one
 * being looked for be found without reading the other seven.
 */
export default function AccountSummary({ user }: { user: AdminUserDetail }) {
  const v = user.valuation;
  const up = v.totalGainLoss > 0;
  const down = v.totalGainLoss < 0;
  const tone = up ? "positive" : down ? "negative" : "flat";

  return (
    <Panel title="Дансны хураангуй">
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          icon={<WalletGlyph />}
          label="Нийт үнэ цэн"
          value={<Num value={v.totalValue} digits={0} suffix="₮" />}
          note="мөнгө + хувьцаа"
        />
        <Tile
          icon={<DepositGlyph />}
          label="Нийт хөрөнгө оруулалт"
          value={<Num value={v.totalCostBasis} digits={0} suffix="₮" />}
          note="эзэмшиж буй хувьцааны өртөг"
        />
        <Tile
          icon={<TrendGlyph down={down} />}
          label="Ашиг / алдагдал"
          tone={tone}
          value={
            <>
              {up && "+"}
              <Num value={v.totalGainLoss} digits={0} suffix="₮" />
            </>
          }
        />
        <Tile
          icon={<PercentGlyph />}
          label="Ашгийн хувь"
          tone={tone}
          value={
            v.totalGainLossPct === null ? (
              "—"
            ) : (
              <>
                {up && "+"}
                {v.totalGainLossPct.toFixed(2)}%
              </>
            )
          }
        />
      </div>

      <dl className="mt-4 border-t border-app-divider text-sm">
        <Row label="Мөнгөн үлдэгдэл" icon={<CashGlyph />}>
          <Num value={user.cash} digits={0} suffix="₮" />
        </Row>
        <Row label="Хувьцааны үнэ цэн" icon={<ChartGlyph />}>
          <Num value={v.holdingsValue} digits={0} suffix="₮" />
        </Row>
        <Row label="Захиалга" icon={<OrderGlyph />}>
          {user.orderCount.toLocaleString("mn-MN")}
        </Row>
        <Row label="Хувьцаа" icon={<StackGlyph />}>
          {user.positionCount.toLocaleString("mn-MN")}
        </Row>
        <Row label="Нэвтэрсэн сешн" icon={<DeviceGlyph />}>
          {user.sessions.toLocaleString("mn-MN")}
        </Row>
      </dl>
    </Panel>
  );
}

/**
 * One headline figure. The mark sits in a tinted square rather than loose
 * beside the label: at 15px a stroked glyph on a white card is a smudge, and
 * the square is what gives it enough ground to read as a symbol.
 */
function Tile({
  icon,
  label,
  value,
  note,
  tone = "flat",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: "positive" | "negative" | "flat";
}) {
  const paint =
    tone === "positive"
      ? { color: "var(--app-positive)", background: "var(--app-positive-bg)" }
      : tone === "negative"
        ? { color: "var(--app-negative)", background: "var(--app-negative-bg)" }
        : { color: "var(--brand-dark)", background: "var(--brand-light)" };

  return (
    <div className="min-w-0 rounded-xl border border-app-border p-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={paint}
        >
          {icon}
        </span>
        <span className="min-w-0 text-[11px] leading-tight text-app-muted">{label}</span>
      </div>
      <div
        className="mt-2 truncate text-[17px] font-semibold tracking-[-0.02em] tabular-nums"
        style={tone === "flat" ? undefined : { color: paint.color }}
      >
        {value}
      </div>
      {note && <div className="truncate text-[10px] text-app-muted">{note}</div>}
    </div>
  );
}

function Row({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-app-divider py-2.5 last:border-0">
      <dt className="flex min-w-0 items-center gap-2 text-app-muted">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

const TILE = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const LINE = { ...TILE, strokeWidth: 1.8, className: "shrink-0 text-app-muted" };

function WalletGlyph() {
  return (
    <svg {...TILE}>
      <path d="M3.5 8.2c0-1.5 1.2-2.7 2.7-2.7h11.6c1.5 0 2.7 1.2 2.7 2.7v7.6c0 1.5-1.2 2.7-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7Z" />
      <path d="M16.2 12h1.6" />
    </svg>
  );
}

function DepositGlyph() {
  return (
    <svg {...TILE}>
      <path d="M12 3.6v9.8M8.4 10l3.6 3.4 3.6-3.4" />
      <path d="M4.4 15.4v2.4c0 1.2 1 2.2 2.2 2.2h10.8c1.2 0 2.2-1 2.2-2.2v-2.4" />
    </svg>
  );
}

function TrendGlyph({ down }: { down?: boolean }) {
  return (
    <svg {...TILE}>
      <path d={down ? "M3.8 7.4 10 13.6l3.4-3.4 6.8 6.8" : "M3.8 16.6 10 10.4l3.4 3.4 6.8-6.8"} />
      <path d={down ? "M20.2 12.4v4.6h-4.6" : "M20.2 11.6V7h-4.6"} />
    </svg>
  );
}

function PercentGlyph() {
  return (
    <svg {...TILE}>
      <path d="M18.4 5.6 5.6 18.4" />
      <circle cx="7.6" cy="7.6" r="2.4" />
      <circle cx="16.4" cy="16.4" r="2.4" />
    </svg>
  );
}

function CashGlyph() {
  return (
    <svg {...LINE}>
      <rect x="2.8" y="6.4" width="18.4" height="11.2" rx="2.2" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

function ChartGlyph() {
  return (
    <svg {...LINE}>
      <path d="M4 19.4V4.6M4 19.4h15.6" />
      <path d="M8 16.4v-4.2M12 16.4V7.8M16 16.4v-6.4" />
    </svg>
  );
}

function OrderGlyph() {
  return (
    <svg {...LINE}>
      <path d="M6 3.8h12v16.4l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9 8.6h6M9 12.3h4" />
    </svg>
  );
}

function StackGlyph() {
  return (
    <svg {...LINE}>
      <path d="m12 3.4 8.2 4.2L12 11.8 3.8 7.6z" />
      <path d="m3.8 12 8.2 4.2 8.2-4.2M3.8 16.4l8.2 4.2 8.2-4.2" />
    </svg>
  );
}

function DeviceGlyph() {
  return (
    <svg {...LINE}>
      <rect x="2.8" y="4.6" width="18.4" height="12" rx="2.2" />
      <path d="M8.4 20.2h7.2" />
    </svg>
  );
}
