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
      {/* The two animals the market argues in, a half of the card each, with
          the candles they are arguing about between them. Watermarks: they say
          nothing the figures do not, so they are hidden from a screen reader
          and kept faint enough that the number stays the loudest thing here.

          Half the width each and a ceiling of the card's own height. Which of
          the two bounds binds depends on the shape of the card, and the SVG
          settles it: the bull is a long charging profile, the bear a tall
          rearing one, so on a phone the bull is held by the width and the bear
          by the height. Either way each one fills its half as far as it can
          without distorting, and the card is split down the middle.

          Whichever bound binds, each is pushed hard against its own end of the
          card — the marks themselves carry the anchoring, so the half that is
          left over opens towards the middle rather than the edge.

          The middle mark would sit behind the total on a phone, where the card
          is narrow and the text fills it, so it waits for a screen with room. */}
      <BullMark className="pointer-events-none absolute left-0 top-1/2 w-1/2 max-h-full -translate-y-1/2 opacity-[0.13]" />
      <CandlesMark className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block sm:w-28 lg:w-36 opacity-[0.12]" />
      <BearMark className="pointer-events-none absolute right-0 top-1/2 w-1/2 max-h-full -translate-y-1/2 opacity-[0.13]" />

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
