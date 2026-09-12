import Num from "@/components/Num";
import Panel from "@/components/admin/Panel";
import StatTile, {
  DepositGlyph,
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
 * Захиалга and Хувьцаа sit beside them as the same kind of tile rather than
 * as a smaller list underneath — a count is answered as quickly as a figure
 * is, and a page that puts one below the other implies an order of
 * importance neither has. Мөнгөн үлдэгдэл and Хувьцааны үнэ цэн are not
 * repeated here: Нийт үнэ цэн is already their sum, and the account form
 * beside this panel has the cash figure on its own. Нэвтэрсэн сешн moved
 * there too, next to Эрх, since a session count is a fact about who can get
 * in rather than about what the account is worth.
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
    <Panel title="Дансны хураангуй">
      <div className="grid grid-cols-2 gap-2.5">
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
          icon={<OrderGlyph />}
          label="Захиалга"
          value={user.orderCount.toLocaleString("mn-MN")}
        />
        <StatTile
          icon={<StackGlyph />}
          label="Хувьцаа"
          value={user.positionCount.toLocaleString("mn-MN")}
        />
      </div>
    </Panel>
  );
}
