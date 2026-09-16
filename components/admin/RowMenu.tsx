"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface RowAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * The same actions a wide row lays out in full, behind one ⋯ where there is
 * no room for them.
 *
 * A narrow row cannot carry three labelled controls beside a ticker and a
 * price — on a 390px phone they had to drop to a line of their own, which
 * doubled the height of every row in a history several screens long. One
 * 36px button costs nothing and puts the three a tap away, named, which is
 * the same trade every mobile list makes.
 *
 * Rendered through a portal rather than positioned inside the row. The panel
 * this list sits in is `overflow-hidden` so its corners stay round, and a
 * menu opened on the last row would be cut off by exactly that. Fixed to the
 * button's own rectangle instead, which also means it does not care how deep
 * in the page the row is.
 *
 * Because a portal renders into `<body>`, outside the element that makes the
 * administration sheet light, the panel carries `admin-surface` itself — the
 * same reason `ConfirmDialog` does.
 *
 * It closes on anything that would move it: a click elsewhere, Escape, a
 * scroll, a resize. A menu pinned to a rectangle that has since moved is
 * worse than no menu.
 */
export default function RowMenu({
  actions,
  label,
  className = "",
}: {
  actions: RowAction[];
  /** What the button announces, since ⋯ says nothing on its own. */
  label: string;
  className?: string;
}) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) {
        setAt(null);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAt(null);
    };
    const gone = () => setAt(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    // Capture, so a scroll inside any container counts and not only the page.
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
    };
  }, [at]);

  function toggle() {
    if (at) {
      setAt(null);
      return;
    }
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    // Below the button unless there is not room, in which case above it. The
    // height is worked out from the rows rather than measured, because the
    // panel does not exist yet at the moment this has to decide.
    const height = actions.length * 40 + 10;
    const below = box.bottom + 6;
    setAt({
      top: below + height > window.innerHeight - 8 ? box.top - height - 6 : below,
      right: Math.max(8, window.innerWidth - box.right),
    });
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={label}
        className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-elevated hover:text-app-text ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>

      {at !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            style={{ top: at.top, right: at.right }}
            className="admin-surface fixed z-50 w-44 overflow-hidden rounded-xl border border-app-border bg-app-card py-1 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.28)]"
          >
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setAt(null);
                  action.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold hover:bg-app-elevated ${
                  action.danger ? "text-app-negative" : "text-app-text"
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
