import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getTransactions } from "@/lib/portfolio";
import TransactionList from "@/components/TransactionList";
import HoldingsList from "@/components/HoldingsList";
import PortfolioAllocation from "@/components/PortfolioAllocation";
import Num from "@/components/Num";
import PageHeader from "@/components/PageHeader";
import StatTile, {
  CashGlyph,
  DepositGlyph,
  PercentGlyph,
  TrendGlyph,
} from "@/components/StatTile";

/**
 * Enough to see this week's activity without turning the portfolio into a
 * ledger; the rest is one tap away.
 */
const RECENT_ORDERS = 10;

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const [portfolio, transactions] = await Promise.all([
    getPortfolioSummary(db, user!._id!),
    getTransactions(db, user!._id!),
  ]);

  /**
   * Nothing made and nothing lost is neither good news nor bad, and a zero
   * painted green says it was good news. It takes the plain colour.
   */
  const gain =
    portfolio.totalGainLoss > 0
      ? ("positive" as const)
      : portfolio.totalGainLoss < 0
        ? ("negative" as const)
        : ("flat" as const);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <PageHeader title="Багц" />

      <div className="rounded-3xl bg-app-card border border-app-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-app-muted">Нийт үнэ цэнэ</div>
            <div className="text-2xl text-app-text">
              <Num value={portfolio.totalValue} digits={2} suffix="₮" />
            </div>
          </div>
          <div
            className={`text-right text-sm font-semibold ${
              portfolio.todayGain >= 0 ? "text-app-positive" : "text-app-negative"
            }`}
          >
            <div>
              <Num value={portfolio.todayGain} digits={2} suffix="₮" showSign />
            </div>
            <div className="text-xs font-normal text-app-muted">өнөөдөр</div>
          </div>
        </div>
        {/* Four figures: what went in, what is still uncommitted, what the
            positions have made, and that as a rate.

            The market value of the holdings used to sit second and no longer
            does. It was the one figure here that could be worked out from the
            others — the total at the top less the cash — and it read as a
            near-duplicate of that total, two large tugrik amounts a
            centimetre apart that differ only by the cash. The ring below
            breaks the same number down by company, which is the useful form
            of it. Cash takes the place: it is the only thing on this card
            that cannot be derived, and it is what a reader checks before
            deciding whether they can buy anything.

            They are tiles rather than four bare label-and-value pairs, and
            the same tiles the administrator's account summary uses. Four
            figures at 14px under a 24px total read as a footnote to it; they
            are not one — the total says what the account is worth and these
            say why. A mark behind each is what lets the one being looked for
            be found without reading the other three. */}
        <div className="grid grid-cols-2 gap-3 border-t border-app-border pt-4 lg:grid-cols-4">
          {/* What the positions cost, which the card never said. Without it
              the gain below is a number with nothing to be a gain on: a
              reader could see 326,821₮ made and 4,237,052₮ held and still not
              know what had been put in. */}
          <StatTile
            icon={<DepositGlyph />}
            label="Нийт хөрөнгө оруулалт"
            value={<Num value={portfolio.totalCostBasis} digits={2} suffix="₮" />}
          />
          <StatTile
            icon={<CashGlyph />}
            label="Бэлэн мөнгө"
            value={<Num value={portfolio.cashBalance} digits={2} suffix="₮" />}
          />
          <StatTile
            icon={<TrendGlyph down={portfolio.totalGainLoss < 0} />}
            label="Нийт ашиг/алдагдал"
            tone={gain}
            value={
              <Num value={portfolio.totalGainLoss} digits={2} suffix="₮" showSign />
            }
          />
          <StatTile
            icon={<PercentGlyph />}
            label="Ашгийн хувь"
            tone={gain}
            value={
              portfolio.totalGainLossPct === null ? (
                "—"
              ) : (
                <Num
                  value={portfolio.totalGainLossPct}
                  digits={2}
                  suffix="%"
                  showSign
                />
              )
            }
          />
        </div>

        <PortfolioAllocation holdings={portfolio.holdings} />
      </div>

      {/* Holdings and the trades that produced them, side by side once there
          is room for both. */}
      <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <section>
        {portfolio.holdings.length === 0 ? (
          <>
            <h2 className="font-semibold text-app-text text-sm mb-3">Хувьцаанууд</h2>
            <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
              Одоогоор хувьцаа худалдаж аваагүй байна.{" "}
              <Link href="/" className="text-brand font-semibold">
                Зах зээл рүү очих
              </Link>
            </div>
          </>
        ) : (
          <HoldingsList holdings={portfolio.holdings} />
        )}
      </section>

      {/* Directly under the holdings: a trade is the other half of a
          position, and reading one without the other means leaving the page. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-app-text text-sm">Захиалгын түүх</h2>
          {transactions.length > RECENT_ORDERS && (
            <Link href="/orders" className="text-xs text-brand font-medium">
              Бүгдийг харах ({transactions.length})
            </Link>
          )}
        </div>
        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
            Одоогоор арилжаа хийгээгүй байна.
          </div>
        ) : (
          <TransactionList transactions={transactions.slice(0, RECENT_ORDERS)} />
        )}
      </section>
      </div>
    </div>
  );
}
