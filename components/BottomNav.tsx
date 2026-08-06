"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./navItems";

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
