"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

/** Where the choice is kept. Read by the pre-paint script in the layout. */
export const THEME_KEY = "mse-theme";

/**
 * The document itself is the store.
 *
 * The pre-paint script has already written the theme onto the root element by
 * the time any of this runs, so reading it back is both the truth and the
 * thing that avoids a hydration mismatch — the server renders no knob at all,
 * and the first client paint fills it in from what is already on screen.
 */
function subscribe(onChange: () => void) {
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => watch.disconnect();
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The server knows nothing about it, and says so rather than guessing. */
function onServer(): Theme | null {
  return null;
}

/**
 * Day and night, as a switch rather than a menu.
 *
 * A pill with the sun at one end and the moon at the other, and a knob that
 * slides between them: the state is the position of the knob, which is
 * readable at a glance and from across a room, where an icon that swaps
 * between a sun and a moon only ever shows half the story — is that the mode
 * you are in, or the one you would get?
 *
 * Both symbols stay visible for that reason. The knob carries the one in
 * force; the other sits dimmed at the far end as the thing a tap would give.
 */
/** What the phone paints around the page — the status bar, the URL chrome. */
const CHROME_COLOR: Record<Theme, string> = { dark: "#0d0f14", light: "#f4f5f8" };

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, onServer);

  // The <meta> is written into the document at build time, so it names one
  // colour forever unless something moves it. Installed as a PWA that colour
  // is the status bar, and a light page under a black bar looks like a page
  // that failed to load the rest of itself.
  useEffect(() => {
    if (!theme) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", CHROME_COLOR[theme]);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing, or storage turned off. The theme still applies for
      // this visit; it simply will not be remembered for the next one.
    }
  }

  const light = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={light}
      aria-label={light ? "Шөнийн горим руу шилжих" : "Өдрийн горим руу шилжих"}
      className="relative h-10 w-[4.75rem] shrink-0 rounded-full border border-app-border bg-app-card px-1 transition-colors active:scale-95"
    >
      {/* The two ends. Whichever the knob is over is covered by it, so the one
          on show is always the mode a tap would move to.

          Inset by the same 0.75rem the knob's own centre sits at, so the sun
          under the knob is concentric with it and the moon left showing is the
          same distance from its edge as the sun is from the other. At 0.625rem
          the icons sat two pixels outboard of the knob centres: the covered
          one looked off-centre inside the knob, and the free one looked
          closer to the rim than its opposite number. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 text-app-muted">
        <SunIcon />
        <MoonIcon />
      </span>

      {/* Nothing until the theme is known, so the knob does not start at one
          end and jump to the other a frame later.

          The night position is 2.125rem across, and that figure is arithmetic
          rather than taste. The pill is 4.75rem (76px) wide including its 1px
          borders, and carries 0.25rem of padding a side, so the track the knob
          runs along is 76 − 2 − 8 = 66px. The knob is 2rem (32px). It can
          therefore travel 66 − 32 = 34px, which is 2.125rem.

          It was 2.25rem — ten pixels too far — so in night mode the knob hung
          off the right-hand end of its own capsule. Written out because the
          number cannot be interpolated: Tailwind reads class names out of the
          source text, so a computed `translate-x-[${...}]` compiles to no
          class at all and the knob would not move. */}
      {theme && (
        <span
          className={`pointer-events-none absolute top-1 left-1 h-8 w-8 rounded-full bg-app-elevated shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out flex items-center justify-center ${
            light
              ? "translate-x-0 text-app-warn"
              : "translate-x-[2.125rem] text-app-text"
          }`}
        >
          {light ? <SunIcon /> : <MoonIcon />}
        </span>
      )}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The crescent, sized and centred to match the sun.
 *
 * Both icons sit in a 24-unit box and neither fills it the same way. Measured:
 * the sun's ink runs 2.5 to 21.5 and is centred on 12 exactly; the crescent's
 * runs 3.22 to 20 — twelve per cent smaller, and centred on 11.61 rather than
 * 12. Two icons that are the same size in markup and different sizes on screen.
 *
 * The consequence is the one that was reported: with both boxes inset equally
 * from the ends of the pill, the moon still sat a pixel further from its edge
 * than the sun did from its, because the gap a reader sees is to the ink and
 * not to the box around it.
 *
 * So the path is scaled by 19/16.78 about its own centre and that centre moved
 * to the box's. Its ink then runs 2.5 to 21.5 like the sun's, which makes the
 * two gaps equal by construction rather than by a nudge that would have to be
 * re-guessed if either icon were ever redrawn — and makes the moon sit
 * concentric inside the knob in night mode, which it also was not.
 *
 * The stroke is divided by the same factor so it comes out at 2 after the
 * scaling. Without that the crescent would be drawn in a heavier line than the
 * sun and look like a different set.
 */
const MOON_SCALE = 19 / 16.78;
const MOON_TRANSFORM = `translate(12 12) scale(${MOON_SCALE}) translate(-11.61 -12.39)`;

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z"
        transform={MOON_TRANSFORM}
        stroke="currentColor"
        strokeWidth={2 / MOON_SCALE}
        strokeLinejoin="round"
      />
    </svg>
  );
}
