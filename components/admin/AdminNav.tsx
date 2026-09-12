"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One bar across the top of the sheet: the mark, the sections, and who is
 * signed in.
 *
 * The rail this replaces put the sections down the left, which is right for
 * an application with fifteen destinations and wasteful for one with three —
 * it spent 236 pixels of every screen on a list that fits in a pill. Across
 * the top the sections sit in the middle where the eye lands first, the
 * account and the way out sit at the right where they are looked for, and the
 * whole width of the sheet is left to the work.
 *
 * The section you are on is a solid dark pill. Not the brand colour: the
 * brand is what the primary action wears on every page under this bar, and a
 * navigation state in the same green competes with it for the same meaning.
 */
const SECTIONS = [
  { href: "/admin", label: "Хяналт" },
  { href: "/admin/users", label: "Хэрэглэгч" },
  { href: "/admin/settings", label: "Систем" },
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

  const sections = (
    <nav className="flex items-center gap-1 rounded-full bg-app-elevated p-1">
      {SECTIONS.map(({ href, label }) => {
        const active = owns(href);
        const count = counts?.[href];
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition-colors ${
              active
                ? "font-semibold text-white"
                : "font-medium text-app-muted hover:text-app-text"
            }`}
            style={active ? { backgroundColor: "var(--admin-ink)" } : undefined}
          >
            {label}
            {count !== undefined && (
              <span
                className={`text-xs tabular-nums ${active ? "text-white/60" : "text-app-muted"}`}
              >
                {count.toLocaleString("mn-MN")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <header className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-6 md:py-4">
      <Link href="/admin" className="flex min-w-0 shrink-0 items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{
            background: "linear-gradient(150deg, var(--admin-fill-from), var(--admin-fill-to))",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V6.5M4 19h16M8 19v-6M13 19V9M18 19v-9.5" />
          </svg>
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-app-text">
          Удирдлага
        </span>
      </Link>

      {/* Centred on a wide screen, on its own line below one. */}
      <div className="order-3 w-full overflow-x-auto md:order-none md:mx-auto md:w-auto md:overflow-visible">
        {sections}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        {serviceAdmin ? (
          // The administration-only account has nowhere to go but out: the
          // app side turns it away, so a link to it would be a round trip.
          <button
            onClick={logout}
            disabled={leaving}
            aria-label="Гарах"
            title="Гарах"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-app-border text-app-muted hover:text-app-negative disabled:opacity-60"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 5.5H6.5v13H14M17 12H10m4.5-3 3 3-3 3" />
            </svg>
          </button>
        ) : (
          <Link
            href="/"
            aria-label="Апп руу"
            title="Апп руу"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-app-border text-app-muted hover:text-app-text"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 11 12 4.5l7.5 6.5" />
              <path d="M6.5 10v9h11v-9" />
            </svg>
          </Link>
        )}

        <Identity
          username={username}
          serviceAdmin={serviceAdmin}
          accountHref={accountHref}
        />
      </div>
    </header>
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
        style={{
          background: "linear-gradient(150deg, var(--admin-fill-from), var(--admin-fill-to))",
        }}
      >
        {username.slice(0, 2).toUpperCase()}
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-[13px] font-semibold text-app-text">
          @{username}
        </span>
        <span className="block truncate text-[11px] text-app-muted">
          {serviceAdmin ? "Системийн админ" : "Админ"}
        </span>
      </span>
    </>
  );
  const shell = "flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 sm:pr-3.5";
  return accountHref ? (
    <Link href={accountHref} className={`${shell} hover:bg-app-elevated`}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  );
}
