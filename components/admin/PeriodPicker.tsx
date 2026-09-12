"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PERIODS, periodHref } from "@/lib/adminPeriod";

/** The pill that sets the window. See `lib/adminPeriod.ts` for what it means. */
export default function PeriodPicker({ days }: { days: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const current = PERIODS.find((p) => p.days === days) ?? PERIODS[0];

  // A menu that stays open after the pointer has gone elsewhere is a menu
  // somebody has to dismiss; Escape answers the same way it does everywhere.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  function choose(next: number) {
    setOpen(false);
    router.push(periodHref(next, params));
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-app-border bg-app-card px-4 py-2.5 text-sm font-semibold text-app-text hover:bg-app-elevated"
      >
        {current.label}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-app-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-app-border bg-app-card py-1 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.18)]"
        >
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              role="option"
              aria-selected={p.days === days}
              onClick={() => choose(p.days)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                p.days === days
                  ? "font-semibold text-app-text"
                  : "text-app-muted hover:bg-app-elevated hover:text-app-text"
              }`}
            >
              {p.label}
              {p.days === days && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
