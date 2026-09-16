"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "@/components/ui/useAnchoredPanel";

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
 * It closes on a click elsewhere or on Escape, and otherwise follows its
 * button: where it is drawn is `useAnchoredPanel`'s job, which re-measures on
 * every scroll and every move of the visible viewport rather than placing it
 * once and hoping. See the note there for why one measurement was not enough.
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
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Right-aligned: the ⋯ is the last thing on the row, so a menu hanging off
  // its left edge is a menu inside the page rather than off it.
  const at = useAnchoredPanel({ open, anchor: button, panel, align: "right" });

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) {
        setOpen(false);
      }
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

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-elevated hover:text-app-text ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            style={{
              top: at?.top ?? 0,
              left: at?.left ?? 0,
              // Hidden until measured and placed, which happens before paint.
              visibility: at ? "visible" : "hidden",
            }}
            className="admin-surface fixed z-50 w-44 overflow-hidden rounded-xl border border-app-border bg-app-card py-1 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.28)]"
          >
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
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
