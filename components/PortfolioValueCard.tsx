"use client";

import { useState } from "react";
import Num from "@/components/Num";
import { ArrowUpIcon, ArrowDownIcon, EyeIcon } from "@/components/icons";

function BullIcon({ className }: { className?: string }) {
  // Simplified silhouette: horns, head, humped back — decorative only.
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path
        d="M18 30 L28 20 M14 38 Q10 26 20 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M82 30 L72 20 M86 38 Q90 26 80 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M22 42 Q20 30 32 26 Q50 20 68 26 Q80 30 78 42
           Q88 46 86 58 Q84 70 68 72
           L66 82 Q50 88 34 82 L32 72
           Q16 70 14 58 Q12 46 22 42 Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <circle cx="40" cy="44" r="3.4" fill="black" fillOpacity="0.35" />
      <circle cx="60" cy="44" r="3.4" fill="black" fillOpacity="0.35" />
    </svg>
  );
}

function BearIcon({ className }: { className?: string }) {
  // Simplified silhouette: round ears, head, downward paw — decorative only.
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="26" cy="24" r="11" fill="currentColor" fillOpacity="0.9" />
      <circle cx="74" cy="24" r="11" fill="currentColor" fillOpacity="0.9" />
      <path
        d="M50 26 Q78 26 82 52 Q86 78 62 84 Q50 87 38 84
           Q14 78 18 52 Q22 26 50 26 Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <circle cx="40" cy="52" r="3.4" fill="black" fillOpacity="0.35" />
      <circle cx="60" cy="52" r="3.4" fill="black" fillOpacity="0.35" />
      <path
        d="M28 70 Q20 84 10 88 M72 70 Q80 84 90 88"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function MarketMarkIcon({ className }: { className?: string }) {
  // A small exchange/ticker mark for the card's own center — distinct from
  // the corner chart watermark, understated enough to sit behind the number.
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        d="M34 56 L42 44 L52 52 L66 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M58 32 L66 32 L66 40" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      <BullIcon className="pointer-events-none absolute -left-5 bottom-0 h-28 w-28 text-black/10" />
      <BearIcon className="pointer-events-none absolute -right-5 -top-4 h-28 w-28 text-black/10" />
      <MarketMarkIcon className="pointer-events-none absolute right-1/2 top-1/2 h-24 w-24 translate-x-1/2 -translate-y-1/2 text-black/[0.06]" />

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
