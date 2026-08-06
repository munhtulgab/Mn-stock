import type { ArticleBlock } from "@/lib/mse/exchangeNews";
import type { TradeReport } from "@/lib/tradeReports";

/**
 * The exchange's own report, read on the page rather than linked away to.
 *
 * The lead paragraph is always out — on the daily report that one sentence
 * is the day's turnover and how many companies rose — and the rest of it,
 * which on the weekly review runs to seven tables, opens on a tap. Native
 * <details>, so it works before any JavaScript arrives and costs nothing
 * when it stays shut.
 */
export default function TradeReportCard({ report }: { report: TradeReport }) {
  const [lead, ...rest] = report.body;

  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-4 h-full space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-text">{report.title}</h2>
        <span className="text-[11px] text-app-muted tabular-nums whitespace-nowrap">
          {report.date}
        </span>
      </div>

      {lead && <Block block={lead} />}

      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-brand active:opacity-70">
            {/* Two labels, one shown at a time: no state to keep. */}
            <span className="group-open:hidden">Дэлгэрэнгүй</span>
            <span className="hidden group-open:inline">Хураах</span>
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </details>
      )}

      <a
        href={report.url}
        target="_blank"
        rel="noreferrer"
        className="block text-[11px] text-app-muted active:opacity-70"
      >
        mse.mn
      </a>
    </section>
  );
}

function Block({ block }: { block: ArticleBlock }) {
  if (block.kind === "table") return <Table rows={block.rows} />;
  if (block.kind === "li") {
    return (
      <p className="flex gap-2 text-xs text-app-muted leading-relaxed">
        <span aria-hidden className="text-app-border">
          •
        </span>
        <span>{block.text}</span>
      </p>
    );
  }
  return <p className="text-xs text-app-muted leading-relaxed">{block.text}</p>;
}

/**
 * The review's tables are up to eight columns of figures, which no phone
 * fits. The table scrolls inside its own box rather than making the page
 * scroll sideways.
 */
function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-max min-w-full text-[11px] tabular-nums">
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th
                key={i}
                className="px-1.5 py-1 text-left font-medium text-app-muted whitespace-nowrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="border-t border-app-border">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="px-1.5 py-1 text-app-text whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
