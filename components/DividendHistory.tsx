import type { DividendRow } from "@/lib/analysis/report";
import Num from "./Num";

/**
 * Every payout either source knows this company has made.
 *
 * A year the exchange itself announced links back to the announcement, so a
 * reader can check the figure — which matters more here than anywhere else
 * on the page, because a dividend that cannot be traced is one nobody should
 * act on. The years only TDB's Datalab carries have no notice to link to and
 * say so rather than pretending to a source they do not have.
 *
 * The yield is against today's price rather than the price on the day of the
 * announcement, since today's is the one a reader can still buy at.
 */
export default function DividendHistory({
  dividends,
}: {
  dividends: DividendRow[];
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
                    <td className="py-1.5 pr-2 text-app-muted whitespace-nowrap">
                      {dividend.year} он
                      {/* A half-yearly payer's row is two declarations added
                          together, and a reader comparing it against a single
                          announcement should be able to see why it is larger. */}
                      {dividend.payments > 1 && (
                        <span className="ml-1 text-[10px]">
                          ({dividend.payments} удаа)
                        </span>
                      )}
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
                      {/* Every row links to the announcement it was read from.
                          That is the point of using the exchange's notices:
                          a figure the reader can check. */}
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
            Он гэдэг нь ашиг олсон жил — МХБ-ийн мэдэгдэлд заасны дагуу. Хагас
            жилээр хоёр удаа хуваарилсан бол нийлбэрээр нь харуулав. Өгөөжийг
            өнөөдрийн ханшаар тооцов. Огноон дээр дарж эх мэдэгдлийг үзнэ.
          </p>
        </>
      )}
    </div>
  );
}
