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
 *
 * The heading line carries what to do with the card rather than its date:
 * the title already says which day the report is about, and "Дэлгэрэнгүй" is
 * what a reader is looking for there. The date goes to the far end of the
 * footer, opposite the source, which is where the rest of the app puts it.
 *
 * The whole head is the toggle — title, and the lead under it — so opening
 * the report is a tap anywhere on what is already showing rather than on one
 * word of it.
 */
export default function TradeReportCard({ report }: { report: TradeReport }) {
  const [lead, ...rest] = report.body;

  const head = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-text">{report.title}</h2>
        {rest.length > 0 && (
          <span className="shrink-0 text-[11px] font-semibold text-brand whitespace-nowrap">
            {/* Two labels, one shown at a time: no state to keep. */}
            <span className="group-open:hidden">Дэлгэрэнгүй</span>
            <span className="hidden group-open:inline">Хураах</span>
          </span>
        )}
      </div>
      {lead && <div className="mt-2">{<Block block={lead} />}</div>}
    </>
  );

  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-4 h-full space-y-2">
      {rest.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none active:opacity-70">
            {head}
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </details>
      ) : (
        head
      )}

      <div className="flex items-baseline justify-between gap-3 text-[11px] text-app-muted">
        <a
          href={report.url}
          target="_blank"
          rel="noreferrer"
          className="active:opacity-70"
        >
          mse.mn
        </a>
        <span className="shrink-0 tabular-nums whitespace-nowrap">{report.date}</span>
      </div>
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
