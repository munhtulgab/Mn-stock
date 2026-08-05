"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./navItems";

/**
 * The rail a laptop or a landscape iPad gets in place of the tab bar.
 *
 * A tab bar exists because a thumb reaches the bottom of a phone; neither of
 * those is held in a hand, and on both there is width to spare that a
 * centred phone column simply wastes. So navigation moves to the side, with
 * every destination named rather than guessed at from an icon — including
 * the alert feed, which on a phone hides behind the bell in the header.
 */
export default function SideNav({ unread }: { unread: number }) {
  const pathname = usePathname();

  return (
    <nav className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col gap-1 border-r border-app-border bg-app-card px-3 py-6">
      <Link href="/" className="flex items-center gap-2.5 px-3 pb-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-black font-bold">
          M
        </span>
        <span className="text-base font-bold text-app-text">MSE Invest</span>
      </Link>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href, true);
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-brand-light font-semibold text-brand"
                : "text-app-muted hover:bg-app-elevated hover:text-app-text"
            }`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {href === "/notifications" && unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-black">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
