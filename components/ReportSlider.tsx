"use client";

import { useRef, useState } from "react";

/**
 * Several reports for one period, one at a time.
 *
 * The day the trading report comes out is usually also the day the bond
 * auction is reported, and both belong beside the day's figures — but
 * stacked they push the headlines down the page and only one of them is
 * being read anyway. So they share one slot and it swipes.
 *
 * The swiping is scroll snapping rather than a transform: a touch drag, a
 * trackpad flick and a shove of the scrollbar all do the right thing without
 * any of them being implemented, and the dots only have to say where the
 * scroll got to.
 */
export default function ReportSlider({
  slides,
  labels,
}: {
  slides: React.ReactNode[];
  /** One per slide, for the dot's accessible name. */
  labels: string[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (slides.length === 0) return null;
  if (slides.length === 1) return <>{slides[0]}</>;

  const go = (index: number) => {
    const rail = track.current;
    if (!rail) return;
    rail.scrollTo({ left: index * rail.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div
        ref={track}
        onScroll={(event) => {
          const rail = event.currentTarget;
          setActive(Math.round(rail.scrollLeft / Math.max(rail.clientWidth, 1)));
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {slides.map((slide, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {slide}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={labels[i] ?? `${i + 1}`}
            aria-current={i === active}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-5 bg-brand" : "w-1.5 bg-app-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
