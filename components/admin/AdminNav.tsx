"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The admin area's own navigation: a rail down the left on a desk, a bar
 * across the top on a phone.
 *
 * Not the app's tab bar, and no longer a row of pills either. Pills along the
 * top competed with the page's own heading for the same line and gave the
 * sections nowhere to say anything about themselves; a rail has room for a
 * count beside each name, which is what an administrator opening this wants
 * to know before they have clicked anything. It also puts the way out — the
 * account, and the door — at the bottom where it belongs rather than in the
 * corner beside the sections.
 *
 * Below `md` the rail would eat a third of the screen, so it becomes a
 * heading and a scrollable row of the same three destinations.
 */
const SECTIONS = [
  { href: "/admin", label: "Хяналт", icon: GridIcon },
  { href: "/admin/users", label: "Хэрэглэгч", icon: PeopleIcon },
  { href: "/admin/settings", label: "Систем", icon: GearIcon },
];

export default function AdminNav({
  username,
  serviceAdmin,
  accountHref,
  counts,
}: {
  username: string;
  /** True for the administration-only account, which has no app side to go to. */
  serviceAdmin?: boolean;
  /** This administrator's own row, where they change their own password. */
  accountHref?: string;
  /** Shown against the section it belongs to; omitted while unknown. */
  counts?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const owns = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setLeaving(false);
    }
  }

  const away = serviceAdmin ? (
    // The administration-only account has nowhere to go but out: the app side
    // turns it away, so a link to it would be a round trip back to this page.
    <button
      onClick={logout}
      disabled={leaving}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-negative disabled:opacity-60"
    >
      <DoorIcon />
      {leaving ? "Гарч байна…" : "Гарах"}
    </button>
  ) : (
    <Link
      href="/"
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-text"
    >
      Апп руу
      <span aria-hidden>→</span>
    </Link>
  );

  return (
    <>
      {/* ---- the rail, from md up ---- */}
      <aside className="hidden shrink-0 flex-col gap-6 border-r border-app-border bg-app-card px-3.5 py-4 md:flex md:w-[236px]">
        <Wordmark />

        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = owns(href);
            const count = counts?.[href];
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={`relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-app-elevated font-semibold text-app-text"
                    : "font-medium text-app-muted hover:bg-app-elevated/60 hover:text-app-text"
                }`}
              >
                {/* The mark for "you are here" sits in the rail's own gutter,
                    so it reads as a position rather than as a decorated card. */}
                {active && (
                  <span className="absolute -left-3.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                )}
                <Icon />
                {label}
                {count !== undefined && (
                  <span className="ml-auto text-xs font-semibold tabular-nums text-app-muted">
                    {count.toLocaleString("mn-MN")}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          <Identity
            username={username}
            serviceAdmin={serviceAdmin}
            accountHref={accountHref}
          />
          {away}
        </div>
      </aside>

      {/* ---- the bar, below md ---- */}
      <header className="sticky top-0 z-30 border-b border-app-border bg-app-card md:hidden">
        <div className="flex items-center gap-3 px-4 pt-3">
          <Wordmark />
          <div className="ml-auto shrink-0">{away}</div>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-4 pt-3 pb-3">
          {SECTIONS.map(({ href, label }) => {
            const active = owns(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={`shrink-0 rounded-[10px] border px-3 py-1.5 text-sm whitespace-nowrap ${
                  active
                    ? "border-app-border bg-app-elevated font-semibold text-app-text"
                    : "border-transparent font-medium text-app-muted"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/admin" className="flex min-w-0 items-center gap-2.5 px-1.5">
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand"
        style={{ color: "var(--on-brand)" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V6.5M4 19h16M8 19v-6M13 19V9M18 19v-9.5" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">MSE Invest</span>
        <span className="block text-[10px] font-semibold tracking-[0.11em] text-app-muted uppercase">
          Удирдлага
        </span>
      </span>
    </Link>
  );
}

function Identity({
  username,
  serviceAdmin,
  accountHref,
}: {
  username: string;
  serviceAdmin?: boolean;
  accountHref?: string;
}) {
  const inner = (
    <>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold"
        style={{ color: "var(--on-brand)" }}
      >
        {username.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-app-text">
          @{username}
        </span>
        <span className="block text-[11px] text-app-muted">
          {serviceAdmin ? "Системийн админ" : "Админ"}
        </span>
      </span>
    </>
  );
  const shell = "flex items-center gap-2.5 rounded-[10px] bg-app-elevated px-2.5 py-2";
  return accountHref ? (
    <Link href={accountHref} className={shell}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  );
}

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" {...STROKE} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" {...STROKE} />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" {...STROKE} />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" {...STROKE} />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="9.5" cy="8" r="3.3" {...STROKE} />
      <path d="M3.5 19.5c1-3.4 3.4-5 6-5s5 1.6 6 5" {...STROKE} />
      <path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2" {...STROKE} />
      <path d="M18 14.9c1.4.7 2.4 2.1 2.9 4.6" {...STROKE} />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="3.1" {...STROKE} />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"
        {...STROKE}
      />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" className="shrink-0">
      <path d="M14 5.5H6.5v13H14" {...STROKE} />
      <path d="M17 12H10" {...STROKE} />
      <path d="m14.5 9 3 3-3 3" {...STROKE} />
    </svg>
  );
}
