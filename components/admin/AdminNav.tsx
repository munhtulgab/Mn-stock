"use client";

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/Avatar";

/**
 * One bar across the top of the sheet: the mark, the sections, and who is
 * signed in.
 *
 * The rail this replaces put the sections down the left, which is right for
 * an application with fifteen destinations and wasteful for one with four —
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
  { href: "/admin/orders", label: "Захиалга" },
  { href: "/admin/settings", label: "Систем" },
];

export default function AdminNav({
  username,
  email,
  avatar,
  serviceAdmin,
  accountHref,
  counts,
}: {
  username: string;
  /** Under the name, where a product puts the account's address. */
  email?: string;
  avatar?: string;
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
            className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm whitespace-nowrap transition-colors ${
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
            <Pending />
          </Link>
        );
      })}
    </nav>
  );

  return (
    // Three columns from the laptop up, the outer two equal, so the sections
    // sit on the middle of the screen rather than on the middle of whatever
    // the mark and the account left over. `mx-auto` inside a flex row centres
    // within the remaining space, which with a wide right-hand group pushed
    // the pills visibly left of centre.
    //
    // `minmax(0,1fr)` rather than `1fr`: a bare `1fr` will not shrink a track
    // below the width of what is in it, so on a narrow laptop the account
    // group widened its own column and carried the middle ten pixels with it.
    // Both sides may now be narrower than their contents, and both contents
    // truncate. Still a wrapping flex row below md, where the sections take a
    // line of their own.
    <header className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-6 md:py-4">
      <Link href="/admin" className="flex min-w-0 shrink-0 items-center gap-2.5 overflow-hidden">
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
        <span className="truncate text-[17px] font-semibold tracking-[-0.02em] text-app-text">
          Удирдлага
        </span>
      </Link>

      {/* Centred on a wide screen, on its own line below one. */}
      <div className="order-3 w-full overflow-x-auto md:order-none md:w-auto md:overflow-visible">
        {sections}
      </div>

      {/* Who you are, and then the way out — in that order, because the
          button acts on the account named beside it and a control reads as
          belonging to what it follows.

          The cog that used to lead this group is gone. It went to
          /admin/settings, which is Систем in the middle of this same bar:
          two controls a thumb apart doing one thing, and the round one
          saying less about where it goes. */}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 md:ml-0 md:justify-self-end">
        <Identity
          username={username}
          email={email}
          avatar={avatar}
          serviceAdmin={serviceAdmin}
          accountHref={accountHref}
        />

        {serviceAdmin ? (
          // The administration-only account has nowhere to go but out: the
          // app side turns it away, so a link to it would be a round trip.
          <button
            onClick={logout}
            disabled={leaving}
            aria-label="Гарах"
            title="Гарах"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-app-border text-app-muted hover:text-app-negative disabled:opacity-60"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 5.5H6.5v13H14M17 12H10m4.5-3 3 3-3 3" />
            </svg>
          </button>
        ) : (
          <CircleLink href="/" label="Апп руу">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 11 12 4.5l7.5 6.5" />
              <path d="M6.5 10v9h11v-9" />
            </svg>
          </CircleLink>
        )}
      </div>
    </header>
  );
}

/**
 * That the click landed, while the page it asked for is still coming.
 *
 * The fallback below is prefetched, so most of the time this never appears —
 * which is the point of it appearing when it does: a cold prefetch, or a
 * slow connection, is exactly the case where the bar would otherwise sit
 * there looking like nothing had happened.
 *
 * A bar under the pill rather than a spinner beside the label: it is always
 * in the layout at a fixed size and only its opacity changes, so nothing
 * moves when it turns on. See `use-link-status.md` — "prefer a fixed-size,
 * always-rendered hint element and toggle its opacity".
 */
function Pending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-current transition-opacity ${
        pending ? "animate-pulse opacity-60" : "opacity-0"
      }`}
    />
  );
}

function CircleLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-app-border text-app-muted hover:bg-app-elevated hover:text-app-text"
    >
      {children}
    </Link>
  );
}

/**
 * Who is signed in: the picture, the name, and under it the address — the
 * second line an application of this shape always carries. The role stands in
 * when no address is on the account, because a line saying nothing is worse
 * than a line saying which kind of account this is.
 */
function Identity({
  username,
  email,
  avatar,
  serviceAdmin,
  accountHref,
}: {
  username: string;
  email?: string;
  avatar?: string;
  serviceAdmin?: boolean;
  accountHref?: string;
}) {
  const inner = (
    <>
      <Avatar src={avatar ?? ""} name={username} size={38} />
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-[13px] font-semibold text-app-text">
          @{username}
        </span>
        <span className="block truncate text-[12px] text-app-muted">
          {email || (serviceAdmin ? "Системийн админ" : "Админ")}
        </span>
      </span>
    </>
  );
  const shell = "flex items-center gap-2.5 rounded-full p-1 sm:pr-3.5";
  return accountHref ? (
    <Link href={accountHref} className={`${shell} hover:bg-app-elevated`}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  );
}
