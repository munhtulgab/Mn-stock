"use client";

import { useState } from "react";
import Num from "@/components/Num";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  BearMark,
  BullMark,
  CandlesMark,
  EyeIcon,
} from "@/components/icons";

export default function PortfolioValueCard({
  totalValue,
  todayGain,
  todayGainPct,
}: {
  totalValue: number;
  todayGain: number;
  todayGainPct: number | null;
}) {
  const [hidden, setHidden] = useState(false);
  const gained = todayGain >= 0;

  return (
    <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-linear-to-br from-brand to-brand-dark p-5 text-black">
      {/* The chart down the middle, and the two animals arguing about it, a
          half of the card each. Watermarks: they say nothing the figures do
          not, so they are hidden from a screen reader and kept faint enough
          that the number stays the loudest thing here.

          The chart comes first because it goes behind. These three are
          absolutely positioned siblings with nothing to order them but the
          order they are written in, and the candles used to be written in the
          middle — which put them over the bull and under the bear, so the
          same drawing was in front on one side of the card and behind on the
          other. Written first it is behind both, which is where a thing two
          animals are standing over belongs.

          Wider than it was, and no longer waiting for a large screen. It was
          a 112px icon that appeared from `sm` up; it is the picture the card
          is built around now, so it takes half the width and as much of the
          height as the card will give it — and rather more than half on a
          phone, where half of 358px puts twenty-six sessions in 179 and the
          run comes out as specks. Given the extra width it reads as a chart
          again, and it is drawn a shade fainter than the two animals so that
          it stays the thing behind them rather than a third thing competing
          at the same strength.

          Each animal gets half the width and a ceiling of the card's own
          height. Which of the two bounds binds depends on the shape of the
          card, and the SVG settles it: the bull is a long charging profile,
          the bear a tall rearing one, so on a phone the bull is held by the
          width and the bear by the height. Either way each one fills its half
          as far as it can without distorting.

          Whichever bound binds, each is pushed hard against its own end of the
          card — the marks themselves carry the anchoring, so the half that is
          left over opens towards the middle rather than the edge. */}
      <CandlesMark className="pointer-events-none absolute left-1/2 top-1/2 w-[62%] sm:w-1/2 max-h-[82%] -translate-x-1/2 -translate-y-1/2 opacity-[0.14]" />
      <BullMark className="pointer-events-none absolute left-0 top-1/2 w-1/2 max-h-full -translate-y-1/2 opacity-[0.17]" />
      <BearMark className="pointer-events-none absolute right-0 top-1/2 w-1/2 max-h-full -translate-y-1/2 opacity-[0.17]" />

      <div className="relative flex items-center justify-between mb-1">
        <div className="text-xs font-medium opacity-70">Багцын үнэ цэнэ</div>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? "Үнэ цэнийг харуулах" : "Үнэ цэнийг нуух"}
          className="text-black/60 hover:text-black/80 transition-colors p-1 -m-1"
        >
          <EyeIcon off={hidden} />
        </button>
      </div>

      <div className="relative text-3xl font-semibold tracking-tight tabular-nums">
        {hidden ? "•••••• ₮" : <Num value={totalValue} digits={2} suffix="₮" />}
      </div>

      <div className="relative flex items-center gap-2 mt-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums bg-white/90 ${
            gained ? "text-brand-dark" : "text-app-negative"
          }`}
        >
          {gained ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />}
          {hidden ? (
            "••••"
          ) : (
            <>
              <Num value={todayGain} digits={2} suffix="₮" showSign />
              {todayGainPct !== null && (
                <span className="opacity-75 font-medium">
                  (<Num value={todayGainPct} digits={2} suffix="%" showSign />)
                </span>
              )}
            </>
          )}
        </span>
        <span className="opacity-60 text-xs">өнөөдөр</span>
      </div>
    </div>
  );
}
