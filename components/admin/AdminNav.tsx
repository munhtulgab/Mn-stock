"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The admin area's own navigation.
 *
 * Not the app's tab bar. That bar is four market destinations and a profile,
 * and it is fixed to the foot of the screen because it is a phone app's
 * navigation — neither the destinations nor the shape fit a page for looking
 * after accounts. Three sections along the top, and a way back to the app,
 * which is where an administrator spends the rest of their time.
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
}: {
  username: string;
  /** True for the administration-only account, which has no app side to go to. */
  serviceAdmin?: boolean;
  /** This administrator's own row, where they change their own password. */
  accountHref?: string;
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

  return (
    <header className="sticky top-0 z-30 border-b border-app-border bg-app-bg/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2 shrink-0">
          <span className="rounded-lg bg-brand px-2 py-1 text-[11px] font-bold tracking-wide text-white">
            ADMIN
          </span>
          <span className="text-sm font-semibold text-app-text">Удирдлага</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              prefetch
              className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                owns(href)
                  ? "bg-app-card font-semibold text-app-text border border-app-border"
                  : "text-app-muted"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {accountHref ? (
            <Link href={accountHref} className="text-app-muted">
              @{username}
            </Link>
          ) : (
            <span className="hidden text-app-muted sm:inline">@{username}</span>
          )}
          {/* The administration-only account has nowhere to go but out: the
              app side turns it away, so a link to it would be a round trip
              back to this page. */}
          {serviceAdmin ? (
            <button
              onClick={logout}
              disabled={leaving}
              className="font-semibold text-app-negative disabled:opacity-60"
            >
              {leaving ? "Гарч байна…" : "Гарах"}
            </button>
          ) : (
            <Link href="/" className="font-semibold text-brand">
              Апп руу →
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
