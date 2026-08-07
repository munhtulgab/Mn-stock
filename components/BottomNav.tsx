"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./navItems";

/*
 * The bar is positioned by the browser and by nothing else.
 *
 * It used to lift itself with a transform computed from
 * `window.innerHeight - (visualViewport.offsetTop + visualViewport.height)`,
 * on every visual-viewport resize and scroll, to keep it against the foot of
 * what a zoomed reader could see. That arithmetic is only correct while the
 * two viewports report what it assumes, and on iOS they routinely do not:
 * the toolbars slide and only one of the two figures changes, a pinch ends
 * without a final event, and whatever the last frame computed stays written
 * to the node. The result was the bar stuck across the middle of the screen
 * on an ordinary unzoomed page — the exact fault it was added to prevent,
 * now happening when nobody had zoomed at all.
 *
 * `position: fixed` against the layout viewport is what every other web app
 * does, and it is right in the case that matters: not zoomed. The keyboard —
 * the one case that genuinely moves things — is handled declaratively by
 * `interactive-widget=resizes-content` in the viewport meta, which makes the
 * layout viewport itself shrink so a fixed bar sits above the keyboard
 * without anyone measuring anything. And the auto-zoom that used to force
 * this problem, iOS enlarging the page when a small input takes focus, is
 * already prevented by the 16px floor on inputs in globals.css.
 */

/**
 * Renders inside <Link>, so it can read that link's own transition state.
 * Without it a tap gives no feedback until the server responds and the tab
 * feels unresponsive.
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="nav-pending absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white" />
  );
}

/** The app's tab bar, at every width. */
export default function BottomNav() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.headerOnly);

  return (
    /* Fixed, not sticky. A sticky bar is positioned against its containing
       block inside the scrollport, and on iOS that scrollport changes height
       as the browser's own chrome slides away — which leaves the bar
       mid-screen, or cut, for as long as the transition lasts. Fixed takes
       it out of the scroll altogether; the shell pads the content by the
       height it occupies. */
    <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+26px)] bg-linear-to-t from-app-bg via-app-bg to-transparent">
      <div className="mx-auto max-w-md flex items-center justify-between gap-1 rounded-full bg-linear-to-b from-nav-surface-hi to-nav-surface p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.35)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-label={label}
              onTouchStart={() => {}}
              className={`relative flex items-center justify-center gap-2 rounded-full transition-all active:scale-95 ${
                active
                  ? "bg-linear-to-b from-nav-active-hi to-nav-active text-white px-4 py-2.5 font-semibold text-sm shadow-[0_3px_10px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "text-white/85 w-11 h-11"
              }`}
            >
              <PendingDot />
              <Icon />
              {active && <span className="whitespace-nowrap">{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
