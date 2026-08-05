"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Нүүр", icon: PieIcon },
  { href: "/discover", label: "Зах зээл", icon: TrendIcon },
  { href: "/portfolio", label: "Багц", icon: CertificateIcon },
  { href: "/news", label: "Мэдээ", icon: NewsIcon },
  { href: "/profile", label: "Профайл", icon: PersonIcon },
];

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

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+26px)] bg-linear-to-t from-app-bg via-app-bg to-transparent">
      <div className="mx-auto max-w-md flex items-center justify-between gap-1 rounded-full bg-linear-to-b from-nav-surface-hi to-nav-surface p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_1px_rgba(0,0,0,0.35)]">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          let active = false;
          if (href === "/") {
            active = pathname === "/";
          } else if (href === "/discover") {
            active = pathname.startsWith("/discover") || pathname.startsWith("/stock");
          } else if (href === "/portfolio") {
            // The full order history is the portfolio's own second page.
            active = pathname.startsWith("/portfolio") || pathname.startsWith("/orders");
          } else if (href === "/profile") {
            active = pathname.startsWith("/profile") || pathname === "/settings";
          } else {
            active = pathname.startsWith(href);
          }
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

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function PieIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12V3.5Z" fill="currentColor" />
      <path d="M12 3.5v8.5h8.5" {...STROKE} />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <path d="M4 4v16h16" {...STROKE} />
      <path d="m7.5 15.5 3.5-3.8 2.6 2.4L19 8" {...STROKE} />
      <path d="M14.9 8H19v4.1" {...STROKE} />
    </svg>
  );
}

function CertificateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <rect x="2.8" y="4.5" width="13.4" height="10.5" rx="1" {...STROKE} />
      <path d="M5.8 8.3h7.4M5.8 11.4h4.6" {...STROKE} />
      <circle cx="17.2" cy="14.4" r="3.1" {...STROKE} />
      <path d="m15.4 16.9-.5 3.6 2.3-1.4 2.3 1.4-.5-3.6" {...STROKE} />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <path d="M4 5.5h13v13a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" {...STROKE} />
      <path d="M17 9h2.5A1.5 1.5 0 0 1 21 10.5v8a1.5 1.5 0 0 1-1.5 1.5H17" {...STROKE} />
      <path d="M7 9h7M7 12.5h7M7 16h4" {...STROKE} />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="8" r="3.4" {...STROKE} />
      <path d="M5 20c1.2-3.7 4-5.5 7-5.5s5.8 1.8 7 5.5" {...STROKE} />
    </svg>
  );
}
