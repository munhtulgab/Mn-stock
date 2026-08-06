import type { Dividend } from "@/lib/dividends";
import Num from "./Num";

/**
 * Every payout the exchange has announced for this company.
 *
 * Read from the exchange's own notices, so each row can point back at the
 * announcement it came from — which matters here more than elsewhere,
 * because a dividend figure that cannot be traced is a figure nobody should
 * act on. The yield is against today's price, not the price on the day of
 * the announcement, since that is the one a reader can still buy at.
 */
export default function DividendHistory({
  dividends,
}: {
  dividends: Dividend[];
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <h2 className="text-sm font-semibold text-app-text mb-3">
        Ногдол ашгийн түүх
      </h2>

      {dividends.length === 0 ? (
        <p className="text-xs text-app-muted">
          МХБ-ийн мэдэгдлээс ногдол ашгийн зарлал олдсонгүй.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-app-muted text-left">
                  <th className="font-medium pb-1.5 pr-2">Он</th>
                  <th className="font-medium pb-1.5 px-2 text-right whitespace-nowrap">
                    Нэгж хувьцаанд
                  </th>
                  <th className="font-medium pb-1.5 px-2 text-right">Өгөөж</th>
                  <th className="font-medium pb-1.5 pl-2 text-right whitespace-nowrap">
                    Зарласан
                  </th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((dividend) => (
                  <tr key={dividend.year} className="border-t border-app-border/50">
                    <td className="py-1.5 pr-2 text-app-muted">
                      {dividend.year} он
                    </td>
                    <td className="py-1.5 px-2 text-right text-app-text">
                      <Num value={dividend.amount} digits={2} suffix="₮" />
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-app-positive">
                      {dividend.yieldPct === null
                        ? "—"
                        : `${dividend.yieldPct.toFixed(2)}%`}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <a
                        href={dividend.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tabular-nums text-brand"
                      >
                        {dividend.date}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-app-muted">
            Он гэдэг нь ашиг олсон жил. Өгөөжийг өнөөдрийн ханшаар тооцов.
          </p>
        </>
      )}
    </div>
  );
}
