"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Glyph, { type GlyphName } from "./Glyph";

export interface SelectOption {
  value: string;
  label: string;
  /** The mark shown beside the option, and in the closed control once chosen. */
  icon?: GlyphName;
}

/**
 * A dropdown that can show what each choice *is*, not only what it is called.
 *
 * The browser's own `<select>` cannot: an `<option>` holds text and nothing
 * else, so "Авсан" and "Зарсан" — an arrow in and an arrow out — arrive as
 * two words a reader has to tell apart by reading them. Worse, the closed
 * control is drawn by the operating system, which on a phone is a grey bar
 * that belongs to no part of this application.
 *
 * So this is a button and a list. What it keeps from the element it replaces:
 *
 *  - It still posts. A hidden input carries the value, so a `FormData` built
 *    from the surrounding form sees exactly what a `<select name>` would and
 *    `FilterBar` did not have to learn a second way of reading its controls.
 *  - It still answers the keyboard. Arrows move, Home and End jump, Enter and
 *    Space choose, Escape closes, and the list is a `listbox` with the chosen
 *    row marked, so a screen reader is told the same thing the eye is.
 *
 * The list is drawn through a portal for the reason `RowMenu`'s is: the
 * filter bar is a rounded, `overflow-hidden` card, and a list opened from the
 * bottom row of it would be clipped by the very rule that keeps its corners
 * round. Being fixed to the button's rectangle also means it can flip above
 * the control when the control is near the foot of the screen.
 *
 * Because a portal renders into `<body>`, outside the element that makes the
 * administration sheet light, the panel copies the surface class off the
 * nearest ancestor that has one — otherwise a white bar would open a dark
 * list.
 */
export default function Select({
  name,
  value,
  options,
  onChange,
  label,
  leading,
  dense = false,
  className = "",
  id,
}: {
  /** Posted with the surrounding form. Omit for a control that is not in one. */
  name?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** What the control announces, when no visible `<label>` points at it. */
  label?: string;
  /** A fixed mark on the left, for a control whose options carry none. */
  leading?: GlyphName;
  /**
   * Tighter padding, for a control in a narrow column — the month and the
   * year beside two arrows inside half a picker panel. It buys about ten
   * pixels of wording, which is the difference between "2026" and "20…".
   */
  dense?: boolean;
  className?: string;
  id?: string;
}) {
  const [at, setAt] = useState<{
    top: number;
    left: number;
    width: number;
    /** The palette class the list has to carry out through the portal. */
    surface: string;
    /** Where the button was when this opened, to tell a real scroll from a late one. */
    anchor: { top: number; left: number };
  } | null>(null);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = options.find((o) => o.value === value) ?? options[0];
  const open = at !== null;
  // A list where nothing carries a mark — the months of a year, say — gets no
  // icon column at all, rather than the same placeholder twelve times.
  const marked = options.some((o) => o.icon);

  const anchor = at?.anchor;
  useEffect(() => {
    if (!open || !anchor) return;
    panel.current?.focus();
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) {
        setAt(null);
      }
    };
    // A scroll closes it, but only once the button has really moved. Clicking
    // a control near the foot of the screen focuses it, the browser scrolls it
    // into view, and that scroll is delivered on the next frame — after the
    // list has opened. Closing on the event itself would make such a control
    // impossible to open at all.
    const moved = () => {
      const box = button.current?.getBoundingClientRect();
      if (!box || Math.abs(box.top - anchor.top) > 1 || Math.abs(box.left - anchor.left) > 1) {
        setAt(null);
      }
    };
    const gone = () => setAt(null);
    document.addEventListener("mousedown", away);
    // Capture, so a scroll inside any container counts and not only the page.
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", gone);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", gone);
    };
  }, [open, anchor]);

  function place() {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    // Worked out from the row count rather than measured, because the list
    // does not exist yet at the moment this has to decide which way to open.
    const height = Math.min(options.length, 7) * 44 + 12;
    const below = box.bottom + 6;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setAt({
      top: below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 6) : below,
      left: Math.min(box.left, Math.max(8, window.innerWidth - box.width - 8)),
      width: box.width,
      // Read here rather than while rendering the list: by then the list is
      // in `<body>` and the button's surroundings are no longer above it.
      surface: button.current?.closest(".admin-surface") ? "admin-surface " : "",
      anchor: { top: box.top, left: box.left },
    });
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    setAt(null);
    button.current?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onListKey(event: React.KeyboardEvent) {
    const last = options.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in keys) {
      event.preventDefault();
      setActive(keys[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setAt(null);
      button.current?.focus();
    }
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? setAt(null) : place())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) place();
          }
        }}
        className={`flex w-full items-center rounded-xl border bg-app-card text-left text-sm font-medium text-app-text ${
          dense ? "gap-2 px-2.5 py-2" : "gap-2.5 px-3 py-2.5"
        } ${
          open ? "border-brand ring-2 ring-[color-mix(in_srgb,var(--brand)_22%,transparent)]" : "border-app-border"
        } ${className}`}
      >
        {(leading || chosen?.icon) && (
          <span className="shrink-0 text-app-muted">
            <Glyph name={leading ?? chosen!.icon!} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{chosen?.label ?? ""}</span>
        <span className="shrink-0 text-app-muted">
          <Glyph name={open ? "chevronUp" : "chevron"} size={dense ? 12 : 14} />
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onListKey}
            style={{ top: at.top, left: at.left, minWidth: at.width }}
            className={`${at.surface}fixed z-50 max-h-[19rem] overflow-y-auto overscroll-contain rounded-2xl border border-app-border bg-app-card py-1.5 shadow-[0_18px_44px_-12px_rgba(16,24,40,0.3)] outline-none`}
          >
            {options.map((option, index) => {
              const picked = option.value === value;
              return (
                <button
                  key={option.value || "all"}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm ${
                    index === active ? "bg-app-elevated" : ""
                  } ${picked ? "font-semibold text-brand" : "font-medium text-app-text"}`}
                >
                  {marked && (
                    <span className={picked ? "shrink-0 text-brand" : "shrink-0 text-app-muted"}>
                      <Glyph name={option.icon ?? "tag"} size={17} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {picked && (
                    <span className="shrink-0 text-brand">
                      <Glyph name="check" size={15} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
