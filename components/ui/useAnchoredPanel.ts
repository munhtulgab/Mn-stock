"use client";

import { useLayoutEffect, useRef, useState } from "react";

export interface PanelAt {
  top: number;
  left: number;
  /** The anchor's own width, for a list that should be at least as wide. */
  anchorWidth: number;
  /** The palette class the panel must carry out through the portal. */
  surface: string;
}

/**
 * Keeps a panel drawn in `<body>` glued to the control that opened it.
 *
 * Both of the popups in this application — the dropdown's list and a row's ⋯
 * menu — are rendered through a portal, because the cards they open from are
 * rounded and `overflow-hidden` and would otherwise clip them. That means
 * they are positioned by hand, and the obvious way to do it is to measure the
 * button once on the click and leave the panel there. That is what this
 * replaces, and it was wrong in two ways.
 *
 * It was wrong *later*: a `fixed` panel placed from one measurement stays
 * where it was put while the page moves under it. The first version closed on
 * any scroll to hide that, which turned into its own bug — a button near the
 * foot of the screen is scrolled into view by the act of focusing it, and the
 * scroll that follows shut the menu within a frame of it opening.
 *
 * And it could be wrong *immediately*, which is the report this was written
 * for: on a phone, `position: fixed` is laid out against the layout viewport
 * while what the reader sees is the visual viewport, and the two come apart
 * whenever the address bar is mid-collapse or the page is pinched. A panel
 * measured in one and drawn in the other lands somewhere else entirely — and
 * no desktop browser, and no emulated phone, ever reproduces it, because
 * neither has a visual viewport that disagrees with its layout one.
 *
 * So it re-measures instead of remembering: on scroll, on resize, and on both
 * of the `visualViewport` events, which are the only signal a page gets that
 * the address bar moved or that the reader zoomed. Whatever the panel's first
 * position was, it is corrected on the next frame the viewport moves — and
 * the panel now follows its button through a scroll rather than closing.
 *
 * The flip above the button is decided from the panel's *measured* height
 * once it exists, rather than from a guess at how tall a list of four will
 * be. The first pass runs in a layout effect, before the browser paints, so
 * nothing is seen in the wrong place on the way to the right one.
 */
export function useAnchoredPanel({
  open,
  anchor,
  panel,
  align = "left",
  gap = 6,
  margin = 8,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  panel: React.RefObject<HTMLElement | null>;
  /** Which edge of the panel lines up with the same edge of the anchor. */
  align?: "left" | "right";
  /** Space between the anchor and the panel. */
  gap?: number;
  /** Closest the panel may come to the edge of the screen. */
  margin?: number;
}): PanelAt | null {
  const [at, setAt] = useState<PanelAt | null>(null);
  // Read once, on the first placement: the panel is in `<body>` by the time
  // it is drawn, where the button's surroundings are no longer above it.
  const surface = useRef("");

  /**
   * Placing and subscribing are one effect rather than a memoised callback
   * and two more: the function reads `ref.current`, which the React compiler
   * cannot see through well enough to keep a `useCallback` honest, and it is
   * wanted in exactly the two places this effect already covers — once on
   * open, and again whenever the viewport moves.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const button = anchor.current;
      const box = button?.getBoundingClientRect();
      if (!button || !box) return;
      if (!surface.current) {
        surface.current = button.closest(".admin-surface") ? "admin-surface " : "";
      }

      const seen = panel.current?.getBoundingClientRect();
      const width = seen?.width ?? box.width;
      const height = seen?.height ?? 0;

      // The visible window, which on a phone is not the laid-out one.
      const view = typeof visualViewport !== "undefined" ? visualViewport : null;
      const top0 = view ? view.offsetTop : 0;
      const left0 = view ? view.offsetLeft : 0;
      const right = left0 + (view ? view.width : window.innerWidth);
      const bottom = top0 + (view ? view.height : window.innerHeight);

      const below = box.bottom + gap;
      // Above it only when there is really no room below and there is room
      // above; a panel taller than the screen stays below and scrolls.
      const overflows = height > 0 && below + height > bottom - margin;
      const above = box.top - height - gap;
      const top = overflows && above >= top0 + margin ? above : below;

      const wanted = align === "right" ? box.right - width : box.left;
      const left = Math.max(left0 + margin, Math.min(wanted, right - width - margin));

      setAt((was) =>
        was &&
        Math.abs(was.top - top) < 0.5 &&
        Math.abs(was.left - left) < 0.5 &&
        Math.abs(was.anchorWidth - box.width) < 0.5
          ? was
          : { top, left, anchorWidth: box.width, surface: surface.current },
      );
    };

    place();
    // Capture, so a scroll inside any container counts and not only the page.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    visualViewport?.addEventListener("resize", place);
    visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      visualViewport?.removeEventListener("resize", place);
      visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, anchor, panel, align, gap, margin]);

  // Forget the last placement the moment it closes, so the next opening is
  // never drawn at the position of the previous one for a frame. Adjusted
  // during render rather than in an effect: React re-runs this before
  // anything is painted.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setAt(null);
  }

  return at;
}
