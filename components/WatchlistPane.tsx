"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Section from "./Section";
import StockAvatar from "./StockAvatar";
import Num, { Pct } from "./Num";
import type { getWatchlist } from "@/lib/portfolio";

type WatchlistRow = Awaited<ReturnType<typeof getWatchlist>>[number];

/**
 * The watchlist, and — on the wide layout — a set of dots saying how much
 * more of it there is.
 *
 * The pane scrolls sideways and this app hides its scrollbars everywhere, so
 * the only thing saying a seventh card exists was the edge of the next
 * column showing past the 47% ones. That is a hint if you are looking for
 * it and nothing if you are not. The dots say how many screens there are,
 * which one is up, and take you to any of them.
 *
 * A client component for the sake of the dots, which need the pane's own
 * scroll position — and it renders the heading itself so both halves share
 * one ref rather than reaching for each other across the page.
 */
/**
 * A few pixels of overflow are a rounding remainder, not a second screen.
 * The grid's columns are a percentage of a width that is itself fractional.
 */
const SLACK_PX = 8;

/**
 * How many screenfuls there are, counting the part-screen at the end as one:
 * a pane holding two and a half panefuls takes three moves to read.
 */
function pageCount(el: HTMLElement): number {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= SLACK_PX || el.clientWidth === 0) return 1;
  return Math.ceil(max / el.clientWidth) + 1;
}

/**
 * How far apart the dots sit, in scrolled pixels.
 *
 * The scrollable distance divided between them rather than one paneful
 * each, so the last dot lands at the end. Measured with fourteen cards: the
 * pane scrolls 755px and holds 524, so a paneful a dot would have left the
 * final 231 unreachable — and the dot for it lit up on the way past.
 */
function stepOf(el: HTMLElement, pages: number): number {
  if (pages < 2) return 1;
  return (el.scrollWidth - el.clientWidth) / (pages - 1);
}

export default function WatchlistPane({ items }: { items: WatchlistRow[] }) {
  const pane = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);

  const measure = useCallback(() => {
    const el = pane.current;
    if (!el) return;
    const total = pageCount(el);
    setPages(total);
    setPage(total < 2 ? 0 : Math.round(el.scrollLeft / stepOf(el, total)));
  }, []);

  useEffect(() => {
    const el = pane.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      // Scroll fires far faster than anything here needs to be right.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    // The pane's width changes with the window and with the panel beside it,
    // and the number of screens changes with it.
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [measure, items.length]);

  const goTo = (index: number) => {
    const el = pane.current;
    if (!el) return;
    el.scrollTo({ left: index * stepOf(el, pageCount(el)), behavior: "smooth" });
  };

  return (
    <Section
      title="Хяналтын жагсаалт"
      fill
      aside={
        // Only where the pane is a grid of columns, and only when there is
        // something past the first screen: a single dot says nothing except
        // that somebody wrote a dot.
        pages > 1 ? (
          <div className="hidden lg:flex items-center gap-1.5" role="tablist" aria-label="Хяналтын жагсаалтын хуудас">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === page}
                aria-label={`${i + 1}-р хуудас`}
                onClick={() => goTo(i)}
                // Hit area of the row's own height with a small mark inside
                // it: a 6px dot is the target as well as the drawing
                // otherwise, and this sits among text a reader is aiming at.
                className="grid place-items-center h-4 w-4 rounded-full"
              >
                <span
                  className={`block rounded-full transition-all ${
                    i === page ? "h-1.5 w-4 bg-brand" : "h-1.5 w-1.5 bg-app-border"
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {/* Six at a time on the wide layout, and sideways for the rest.
          Cards fill downward in threes and then start a new column, so
          two columns of three are on screen and the next two arrive by
          scrolling right — the same gesture the phone layout already
          uses, rather than a second scroll direction to learn.

          The columns are 47% rather than half, so the pair does not fill
          the width exactly and the next column shows an edge. Without
          that there is nothing to say a seventh card exists: scrollbars
          are hidden throughout this app and some browsers draw them as an
          overlay that takes no layout space at all. The dots above say the
          same thing out loud, and this still says it to a phone.

          The three rows are `1fr` each and nothing pins them to the top,
          so they divide whatever height the row settles at. That is what
          makes the two panels exactly the same height rather than
          approximately: five holding rows come to 327px and three cards
          of their own accord to 312, and the cards take the difference
          instead of leaving fifteen pixels of nothing under the last
          one. */}
      <div
        ref={pane}
        className="pane-scroll flex gap-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-flow-col lg:grid-rows-3 lg:auto-cols-[47%] lg:flex-1 lg:min-h-0"
      >
        {items.map((w) => (
          <Link
            key={w.symbol}
            href={`/stock/${w.symbol}`}
            className="shrink-0 w-60 lg:w-auto rounded-2xl border border-app-border bg-app-card px-4 py-3 active:bg-app-elevated"
          >
            <div className="flex items-center gap-3">
              <StockAvatar symbol={w.symbol} size={40} />
              <div className="min-w-0">
                <div className="font-semibold text-app-text text-sm">{w.symbol}</div>
                <div className="text-xs text-app-muted truncate">{w.name}</div>
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-2.5">
              <span className="text-sm text-app-text">
                <Num value={w.currentPrice ?? 0} digits={2} suffix="₮" />
              </span>
              <span className="text-sm">
                <Pct value={w.changePct} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
