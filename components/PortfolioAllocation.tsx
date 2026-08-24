import type { HoldingView } from "@/lib/holdings";
import { distinctColors } from "@/lib/symbolColor";
import Num from "./Num";

/**
 * What the portfolio is actually made of.
 *
 * The figures above this say what it is worth and what it has made. Neither
 * says that a third of it is one company — which is the thing a reader most
 * needs to know before deciding what to buy next, and the thing a column of
 * tugrik amounts is worst at showing. A ring shows it at a glance and the
 * legend gives the numbers behind it.
 *
 * By market value rather than by cost, because concentration is a fact about
 * what is held now: a position that has doubled is twice the risk it was when
 * it was bought, whatever was paid for it.
 */

/**
 * The ring's geometry. A viewBox unit is a percent of the circumference,
 * which is what lets a slice be written as its own percentage.
 *
 * The box is the ring and nothing else: its side is the outer diameter, so
 * the drawing touches all four edges and the element's size on the page is
 * the circle's size. It was 42 units around a 37.8-unit ring, which put a
 * tenth of the width into margin the browser had already given us — the ring
 * came out a tenth smaller than the space set aside for it, at every size.
 */
const RADIUS = 100 / (2 * Math.PI);
const STROKE = 6;
const SIZE = 2 * RADIUS + STROKE;
const CENTRE = SIZE / 2;

/**
 * Below this a slice is thinner than the gap beside it and reads as a drawing
 * error rather than a holding. It still gets its legend row — the ring is the
 * summary, the list is the record.
 */
const MIN_DRAWN_PCT = 0.35;

export default function PortfolioAllocation({
  holdings,
}: {
  holdings: HoldingView[];
}) {
  const total = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  // Nothing to divide. A ring drawn over a portfolio of nothing is a circle
  // with no meaning, and the empty state above it already says so.
  if (total <= 0 || holdings.length === 0) return null;

  // Sorted before the colours are handed out, so the largest holdings get
  // first pick of the palette and the slivers at the end are the ones that
  // have to share if there are more holdings than colours.
  const bySize = holdings
    .map((h) => ({
      symbol: h.symbol,
      pct: (h.marketValue / total) * 100,
      value: h.marketValue,
    }))
    .sort((a, b) => b.pct - a.pct);

  const colors = distinctColors(bySize.map((slice) => slice.symbol));
  const sized = bySize.map((slice) => ({
    ...slice,
    color: colors.get(slice.symbol)!,
  }));

  // Each arc begins where the ones before it end. Summed from the front for
  // each slice rather than carried in a counter, because a variable
  // reassigned during render holds a different value on the second pass —
  // there are a handful of holdings, so the repeated addition costs nothing.
  //
  // Drawn as dashes on one circle rather than as paths: the whole geometry is
  // then a percentage and an offset, instead of two trigonometric coordinates
  // and an arc flag per wedge.
  const slices = sized.map((slice, i) => ({
    ...slice,
    offset: sized.slice(0, i).reduce((sum, before) => sum + before.pct, 0),
  }));

  return (
    <div className="pt-4 mt-4 border-t border-app-border">
      <h3 className="text-xs text-app-muted mb-4 text-center">Багцын хувиарлалт</h3>
      {/* The ring on the left and its legend on the right, at every width.

          It used to stack below `sm`, on the reasoning that 224px of ring and
          320px of table do not cross 318px of phone. They do not — so the
          phone scrolls sideways instead. The arrangement is the point, and a
          layout that rearranges itself is a second thing to learn; the
          gesture to see the rest of it is the one the watchlist on the home
          screen already uses.

          `w-max` is what makes that work: the row is exactly as wide as the
          two of them want to be, so neither is squeezed and the box around it
          is what runs out of room. `mx-auto` centres that row where there is
          space — on a desktop card of twelve hundred pixels the pair sits in
          the middle — and collapses to nothing where there is not, which is
          what puts the ring at the left edge of a phone rather than halfway
          off it.

          The negative margin lets the scroll reach the card's own edges, with
          the padding put back inside as the scroll's own, so the ring starts
          where the text above it starts and the legend can be brought fully
          into view. `.pane-scroll` is here for the scrollbar it takes away,
          the same as the two panes on the home screen. */}
      <div className="pane-scroll overflow-x-auto -mx-5 px-5">
      <div className="flex w-max mx-auto items-center gap-8">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-56 shrink-0 aspect-square -rotate-90 lg:w-72"
          aria-hidden
        >
          {slices
            .filter((slice) => slice.pct >= MIN_DRAWN_PCT)
            .map((slice) => (
              <circle
                key={slice.symbol}
                cx={CENTRE}
                cy={CENTRE}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={STROKE}
                // The slice's own length, then the rest of the ring blank.
                strokeDasharray={`${slice.pct} ${100 - slice.pct}`}
                strokeDashoffset={-slice.offset}
              />
            ))}
        </svg>

        {/* A set width rather than whatever is left. Inside a `w-max` row a
            table that flexed would have no width to flex against, and the
            figures need a fixed one anyway: they are right-aligned in their
            columns, and a column that changed width with the longest amount
            in the portfolio would move every row when one holding grows. */}
        <ul className="w-80 shrink-0 space-y-1.5">
          {slices.map((slice) => (
            <li key={slice.symbol} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="font-semibold text-app-text">{slice.symbol}</span>
              <span className="flex-1 text-right tabular-nums text-app-muted">
                <Num value={slice.value} digits={0} suffix="₮" />
              </span>
              <span className="w-14 text-right tabular-nums font-semibold text-app-text">
                {slice.pct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </div>
  );
}
