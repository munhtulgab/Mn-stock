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
    <div className="lg:col-span-2 relative overflow-hidden rounded-3xl bg-linear-to-br from-brand to-brand-dark p-5 pb-20 lg:pb-5 lg:px-40 text-black">
      {/* The two animals the market argues in, one at each end, with the
          candles they are arguing about between them. Watermarks: they say
          nothing the figures do not, so they are hidden from a screen reader
          and kept faint enough that the number stays the loudest thing here.

          The card changes shape between a phone and a laptop, and the animals
          need different room in each. Narrow, it is tall enough to stand them
          on the floor below the figures — hence the deep bottom padding, which
          is what keeps the change pill off the bull's back. Wide, it is only
          about 130px tall, so anything on the floor is also behind the total;
          there the side padding hands each animal a column of its own and the
          figures sit between them.

          They are sized by height rather than width: the bull is a long
          charging profile and the bear a tall rearing one, so matching their
          widths would leave one of them half the size of the other.

          The middle mark would sit behind the total on a phone, where the card
          is narrow and the text fills it, so it waits for a screen with room. */}
      <BullMark className="pointer-events-none absolute bottom-1 left-1 h-16 w-auto sm:h-20 lg:h-24 opacity-[0.15]" />
      <CandlesMark className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block sm:w-28 lg:w-36 opacity-[0.12]" />
      <BearMark className="pointer-events-none absolute bottom-1 right-1 h-16 w-auto sm:h-20 lg:h-24 opacity-[0.15]" />

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
