"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

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
 * What the tap opens is a sheet from the foot of the screen — a dialog in
 * the middle of it from `sm` up — rather than a dropdown hung off the
 * button. The dropdown had to be drawn in `<body>`, out of the rounded,
 * clipping panel the row sits in, and so placed by hand from the button's
 * measured position and re-placed on every scroll. On an iPhone that chase
 * was always a frame behind: the menu opened somewhere other than its
 * button and ran after it as the page moved. A sheet has no position to
 * work out. It sits where the thumb is, says which order it is about, and
 * nothing behind it can move it.
 *
 * Because a portal renders into `<body>`, outside the element that makes the
 * administration sheet light, the overlay carries `admin-surface` itself —
 * the same reason `ConfirmDialog` does. It closes on Болих, on a tap on the
 * backdrop, or on Escape.
 */
export default function RowMenu({
  actions,
  label,
  detail,
  className = "",
}: {
  actions: RowAction[];
  /** What the button announces, since ⋯ says nothing on its own. */
  label: string;
  /** The row the actions are about, shown at the top of the sheet. */
  detail?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus on Болих, so a stray Enter closes the sheet rather than starting
    // whichever action happens to be first.
    cancel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
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
            // `touch-none`: a drag on the open sheet does not scroll the page
            // out from under the order it is about.
            className="admin-surface fixed inset-0 z-50 flex touch-none items-end justify-center bg-black/45 sm:items-center sm:p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className="w-full max-w-[420px] rounded-t-[22px] border border-app-border bg-app-card p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-12px_40px_rgba(15,19,25,0.18)] sm:rounded-[18px] sm:pb-3"
            >
              {detail && (
                <div className="mb-3 rounded-2xl bg-app-bg p-3 text-sm text-app-text">{detail}</div>
              )}
              <div className="overflow-hidden rounded-2xl border border-app-border">
                {actions.map((action, index) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-semibold hover:bg-app-elevated ${
                      index > 0 ? "border-t border-app-divider" : ""
                    } ${action.danger ? "text-app-negative" : "text-app-text"}`}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                ref={cancel}
                type="button"
                onClick={() => setOpen(false)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-app-border px-4 py-3.5 text-[15px] font-semibold text-app-text"
              >
                <CloseIcon size={15} />
                Болих
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
