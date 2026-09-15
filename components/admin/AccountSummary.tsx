import Num from "@/components/Num";
import Panel from "@/components/admin/Panel";
import StatTile, {
  CashGlyph,
  DepositGlyph,
  DeviceGlyph,
  OrderGlyph,
  PercentGlyph,
  StackGlyph,
  TrendGlyph,
  WalletGlyph,
} from "@/components/StatTile";
import type { AdminUserDetail } from "@/lib/adminUsers";

/**
 * What the account is worth, what it cost, and what it has done.
 *
 * The first four figures are the ones asked of an account before any other:
 * what is in it, what went into it, what that has made or lost, and that same
 * gain as a share of what was put in. The last two are the same fact twice on
 * purpose — a gain of 340,000₮ is a triumph on a two-million-tögrög account
 * and a rounding error on a hundred-million one, and neither figure says so
 * alone.
 *
 * Under them, the four plain counts: the cash on its own, how many companies
 * are held, how many orders have been placed, and how many sessions are open.
 * They are the same kind of tile rather than a smaller list underneath —
 * a count is answered as quickly as a figure is, and a page that puts one
 * below the other implies an order of importance neither has.
 *
 * Мөнгөн үлдэгдэл is here rather than on the form beside this panel, where it
 * used to be read out, for the reason the whole panel exists: it is one of
 * the numbers this account *is*, and the form is where they are changed. The
 * form still has the field — setting a balance by hand is how a drifted one
 * is fixed — but stating it belongs with the rest of the figures, next to the
 * Нийт үнэ цэн it is half of. Нэвтэрсэн тоо came across with it; it was on
 * the form only because it had nowhere else to be.
 *
 * The counts say so in their labels. "Хувьцаа" beside a column of tögrög
 * figures reads as what the shares are worth, which is a different number and
 * one that is also on this panel; "Хувьцааны тоо" cannot be read that way.
 *
 * The valuation is the account holder's own, from the same function behind
 * their portfolio page, so an administrator reading this and the reader
 * reading theirs are looking at one number rather than two. The tiles are
 * that page's tiles too — see `components/StatTile`.
 */
export default function AccountSummary({ user }: { user: AdminUserDetail }) {
  const v = user.valuation;
  const up = v.totalGainLoss > 0;
  const down = v.totalGainLoss < 0;
  const tone = up ? "positive" : down ? "negative" : "flat";

  return (
    <Panel title="Дансны хураангуй" fill>
      {/* `h-full` so the tiles share whatever height the row settles on
          rather than leaving the difference as a gap under the last of them.
          Rows a little taller read as the panel's own proportions; a hundred
          pixels of nothing at the bottom reads as a mistake. */}
      <div className="grid h-full grid-cols-2 gap-2.5">
        <StatTile
          icon={<WalletGlyph />}
          label="Нийт үнэ цэн"
          value={<Num value={v.totalValue} digits={0} suffix="₮" />}
          note="мөнгө + хувьцаа"
        />
        <StatTile
          icon={<DepositGlyph />}
          label="Нийт хөрөнгө оруулалт"
          value={<Num value={v.totalCostBasis} digits={0} suffix="₮" />}
          note="эзэмшиж буй хувьцааны өртөг"
        />
        <StatTile
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
        <StatTile
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
        <StatTile
          icon={<CashGlyph />}
          label="Мөнгөн үлдэгдэл"
          value={<Num value={user.cash} digits={0} suffix="₮" />}
          note="арилжаанд бэлэн"
        />
        <StatTile
          icon={<StackGlyph />}
          label="Хувьцааны тоо"
          value={user.positionCount.toLocaleString("mn-MN")}
        />
        <StatTile
          icon={<OrderGlyph />}
          label="Захиалгын тоо"
          value={user.orderCount.toLocaleString("mn-MN")}
        />
        <StatTile
          icon={<DeviceGlyph />}
          label="Нэвтэрсэн тоо"
          value={user.sessions.toLocaleString("mn-MN")}
        />
      </div>
    </Panel>
  );
}
