import MetricInfo, { type MetricTerm } from "@/components/MetricInfo";
import DividendNotices from "@/components/DividendNotices";
import type { DividendRow } from "@/lib/analysis/report";
import type { Financials } from "@/lib/types";

/**
 * The quarter as the exchange filed it.
 *
 * Every figure open.mse.mn publishes for a company, in the three groups it
 * publishes them in, plus what it has declared as a dividend. The card used
 * to show six of the fourteen while the rest sat in the database unread.
 *
 * A row whose figure the company does not file is left out rather than shown
 * as a dash. That matters most for the banks: a bank files no cost of sales
 * and no gross profit, so four dashes in the middle of its income statement
 * would read as an app that failed to fetch them.
 */

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Tugriks, shares, percent — the unit belongs against the figure. */
type Unit = "money" | "shares" | "percent" | "ratio";

function render(value: number | null | undefined, unit: Unit): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (unit) {
    case "money":
      return `${fmt(value, 0)} ₮`;
    case "shares":
      return `${fmt(value, 0)} ш`;
    case "percent":
      return `${fmt(value, 2)}%`;
    case "ratio":
      return fmt(value, 4);
  }
}

interface Line {
  label: string;
  value: number | null | undefined;
  unit: Unit;
  term: MetricTerm;
}

/** A titled run of rows. The title is bold; the rows are not. */
function Group({ title, lines }: { title: string; lines: Line[] }) {
  const shown = lines.filter(
    (line) => line.value !== null && line.value !== undefined && !Number.isNaN(line.value),
  );
  if (shown.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-bold text-app-text mb-1.5">{title}</h3>
      <dl className="space-y-1">
        {shown.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="text-app-muted">{line.label}</dt>
            {/* The explanation sits after the figure rather than after the
                label: the numbers are what the eye lands on, and the reader
                who wants to know what one means is looking at it, not at the
                words to the left of it. */}
            <dd className="flex items-baseline gap-0.5 text-right tabular-nums text-app-text">
              <span>{render(line.value, line.unit)}</span>
              <MetricInfo term={line.term} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What a company calls its top line.
 *
 * The exchange's four report layouts each name it differently, and the app
 * stores all four under `revenue` — so a bank's interest income would appear
 * under "Борлуулалтын орлого", which a bank does not have.
 */
function revenueLabel(kind: Financials["reportKind"]): string {
  switch (kind) {
    case "bank":
    case "nbfi":
      return "Хүүгийн орлого";
    case "insurance":
      return "Даатгалын хураамжийн орлого";
    default:
      return "Борлуулалтын орлого";
  }
}

export default function FinancialsCard({
  financials,
  marketMedianPe,
  dividends,
}: {
  financials: Financials | null;
  marketMedianPe: number | null;
  dividends: DividendRow[];
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <h2 className="text-sm font-semibold text-app-text mb-3">
        Санхүүгийн үзүүлэлт {financials ? `· ${financials.period}` : ""}
      </h2>

      {financials ? (
        <div className="space-y-3">
          <Group
            title="Санхүүгийн байдал"
            lines={[
              {
                label: "Нийт хөрөнгө",
                value: financials.totalAssets,
                unit: "money",
                term: "totalAssets",
              },
              {
                label: "Өр төлбөрийн дүн",
                value: financials.totalLiabilities,
                unit: "money",
                term: "totalLiabilities",
              },
              {
                label: "Эзэмшигчдийн өмч",
                value: financials.equity,
                unit: "money",
                term: "equity",
              },
              {
                label: "Гаргасан хувьцаа",
                value: financials.sharesOutstanding,
                unit: "shares",
                term: "sharesOutstanding",
              },
            ]}
          />

          <Group
            title="Орлого, үр дүн"
            lines={[
              {
                label: revenueLabel(financials.reportKind),
                value: financials.revenue,
                unit: "money",
                term: "revenue",
              },
              {
                label: "Борлуулсаны өртөг",
                value: financials.costOfSales,
                unit: "money",
                term: "costOfSales",
              },
              {
                label: "Нийт ашиг",
                value: financials.grossProfit,
                unit: "money",
                term: "grossProfit",
              },
              {
                label: "Цэвэр ашиг",
                value: financials.netProfit,
                unit: "money",
                term: "netProfit",
              },
              {
                label: "Нэгж хувьцааны дансны үнэ",
                value: financials.bookValuePerShare,
                unit: "money",
                term: "bookValuePerShare",
              },
            ]}
          />

          <Group
            title="Санхүүгийн харьцаа"
            lines={[
              { label: "ROA", value: financials.roa, unit: "percent", term: "roa" },
              { label: "ROE", value: financials.roe, unit: "percent", term: "roe" },
              { label: "ROTA", value: financials.rota, unit: "ratio", term: "rota" },
              { label: "EPS", value: financials.eps, unit: "money", term: "eps" },
              { label: "P/E", value: financials.pe, unit: "ratio", term: "pe" },
              {
                label: "Захын дундаж P/E",
                value: marketMedianPe,
                unit: "ratio",
                term: "marketPe",
              },
            ]}
          />

          <DividendNotices dividends={dividends} />
        </div>
      ) : (
        <p className="text-xs text-app-muted">Мэдээлэл олдсонгүй.</p>
      )}
    </div>
  );
}
