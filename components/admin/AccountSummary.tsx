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
 * Each figure carries a mark. Nine rows of label-and-value are nine rows the
 * eye has to read in order; a glyph on each is what lets the one being looked
 * for be found without reading the other eight. On the four tiles the mark is
 * the tile's own background, large and clipped by the corner — at 15px in a
 * badge it was a smudge competing with the label beside it, and the tile has
 * room for a mark that can actually be recognised at arm's length. In the
 * list below it stays a small glyph at the head of the line, because a row
 * twenty pixels tall has no background to put anything behind.
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
          note="зах зээлийн үнэ хасах өртөг"
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
          note="оруулсан дүнгээс"
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
 * One headline figure, over its own mark.
 *
 * The glyph is the tile's background rather than a badge beside the label: at
 * fifteen pixels in a tinted square it was a smudge, and it was taking the
 * width the label needed. Run large and off the corner it is something to
 * recognise the tile by before the words are read, which is the whole job of
 * a mark on a figure nobody reads twice.
 *
 * It is clipped rather than inset. A watermark politely fitted inside the
 * padding is a picture, and a picture in a tile this size competes with the
 * number; one that runs off the edge is a texture, and stays behind it.
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
  const ink =
    tone === "positive"
      ? "var(--app-positive)"
      : tone === "negative"
        ? "var(--app-negative)"
        : "var(--brand-dark)";

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-app-border p-3">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -bottom-4 opacity-[0.14]"
        style={{ color: ink }}
      >
        {icon}
      </span>
      <div className="relative">
        <div className="text-[11px] leading-tight text-app-muted">{label}</div>
        <div
          className="mt-1.5 truncate text-[19px] font-semibold tracking-[-0.02em] tabular-nums"
          style={tone === "flat" ? undefined : { color: ink }}
        >
          {value}
        </div>
        {note && <div className="mt-0.5 truncate text-[10px] text-app-muted">{note}</div>}
      </div>
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

/**
 * The tile marks, drawn at the size they are actually used: 84px behind the
 * figure. A stroke weight is in viewBox units, so the 1.9 that read as a
 * hairline at fifteen pixels renders seven pixels thick at this size — heavy
 * enough to read as a drawing rather than as a ground for one.
 */
const TILE = {
  width: 84,
  height: 84,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const LINE = {
  ...TILE,
  width: 15,
  height: 15,
  strokeWidth: 1.8,
  className: "shrink-0 text-app-muted",
};

/**
 * A wallet, with the card pocket that makes it one. Without it the mark is a
 * rounded rectangle with a dash in it, which at eighty pixels reads as an
 * empty box rather than as anything holding money.
 */
function WalletGlyph() {
  return (
    <svg {...TILE}>
      <path d="M3.2 8.4c0-1.5 1.2-2.7 2.7-2.7h12c1.5 0 2.7 1.2 2.7 2.7v7.2c0 1.5-1.2 2.7-2.7 2.7h-12a2.7 2.7 0 0 1-2.7-2.7Z" />
      <path d="M20.6 10.3h-4.2a1.7 1.7 0 0 0 0 3.4h4.2" />
      <path d="M17.1 12h.1" strokeWidth={2.6} />
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
