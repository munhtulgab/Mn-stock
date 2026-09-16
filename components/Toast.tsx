"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

/**
 * What the app says back after you ask it for something.
 *
 * It has been two shapes before this one. A small card above the tab bar,
 * which was missed on a phone held at arm's length; then a card in the middle
 * of the screen behind a dim, which was certainly not missed but stopped the
 * reader dead — a trade is confirmed and the next thing they are asked to do
 * is dismiss the confirmation before they can look at anything.
 *
 * This is the middle of those two: a banner across the top, wide enough and
 * loud enough to be read without being looked for, over the page rather than
 * in front of it. Three things carry it:
 *
 *  - The mark. A tick, a warning, an "i" — which of the three it is, is read
 *    before a single word of it is.
 *  - Two lines. What happened in bold, and the detail under it, because
 *    "Болсонгүй" on its own tells nobody what to do next.
 *  - A bar that drains. It says both that this will go away by itself and
 *    roughly when, which is what stops somebody reaching for the ✕ out of
 *    doubt that it ever will.
 *
 * Several can be up at once now, newest at the top. The card in the middle
 * could only ever say one thing, so a page raising two — a save and the
 * refresh that followed it — queued the second behind the first and showed it
 * to a reader who had moved on. Banners stack, so both are simply there.
 */

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  /** Second line. Optional: a one-line message is a legitimate shape. */
  body?: string;
  variant?: ToastVariant;
  /** Milliseconds on screen. Errors linger; confirmations need less. */
  duration?: number;
  /** A single call to action, e.g. "Дэлгэрэнгүй". */
  action?: { label: string; onClick: () => void };
}

interface Toast extends Required<Pick<ToastOptions, "title" | "variant" | "duration">> {
  id: number;
  body?: string;
  action?: ToastOptions["action"];
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4_000,
  info: 5_000,
  // Something went wrong is worth reading twice.
  error: 7_000,
};

/** At most this many at once; older ones give way rather than filling the page. */
const MAX_ON_SCREEN = 3;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/**
 * Raises a message. Safe to call from anywhere under the provider; outside it
 * the call is a no-op rather than a crash, so a component can be rendered in
 * isolation without dragging the provider along.
 */
export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  return useMemo(() => show ?? (() => {}), [show]);
}

/**
 * The three liveries.
 *
 * Written out rather than taken from the palette tokens: this banner is the
 * same banner on the dark application and on the light administration sheet,
 * and a success that turned into whatever green the surrounding page happened
 * to be using would stop reading as a success on one of them. The greens are
 * dark enough that white sits on them at better than 4.5 to one.
 */
const STYLES: Record<ToastVariant, { card: string; accent: string; icon: React.ReactNode }> = {
  success: {
    card: "linear-gradient(100deg, #2c7549 0%, #47915d 100%)",
    accent: "#2c7549",
    icon: <CheckIcon size={19} />,
  },
  error: {
    card: "linear-gradient(100deg, #a83029 0%, #c8504a 100%)",
    accent: "#a83029",
    icon: <AlertIcon size={19} />,
  },
  info: {
    card: "linear-gradient(100deg, #2b3340 0%, #44506a 100%)",
    accent: "#2b3340",
    icon: <InfoIcon size={19} />,
  },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const style = STYLES[toast.variant];

  useEffect(() => {
    const timer = setTimeout(onClose, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onClose]);

  return (
    <div
      role="status"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      style={{ backgroundImage: style.card }}
      className="animate-[toast-in_220ms_ease-out] pointer-events-auto relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3.5 text-white shadow-[0_14px_36px_-10px_rgba(0,0,0,0.55)]"
    >
      {/* The disc, ringed: a white circle on a coloured field reads as a
          badge, and the halo is what keeps it from reading as a hole. */}
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white"
          style={{ color: style.accent }}
        >
          {style.icon}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[17px] leading-tight font-bold">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 text-[13.5px] leading-snug break-words text-white/85">
            {toast.body}
          </p>
        )}
      </div>

      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onClose();
          }}
          className="shrink-0 rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-bold text-white active:scale-[0.97]"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Хаах"
        className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
      >
        <CloseIcon size={19} />
      </button>

      {/* How long is left, and that there is a "left" at all. */}
      <span className="absolute inset-x-3 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-black/20">
        <span
          className="block h-full origin-left rounded-full bg-white/70"
          style={{ animation: `toast-drain ${toast.duration}ms linear forwards` }}
        />
      </span>
    </div>
  );
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    const variant = options.variant ?? "info";
    const toast: Toast = {
      id: nextId.current++,
      title: options.title,
      body: options.body,
      variant,
      duration: options.duration ?? DEFAULT_DURATION[variant],
      action: options.action,
    };
    setQueue((prev) => [...prev, toast].slice(-MAX_ON_SCREEN));
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Escape takes the newest one down, which is the one the reader has just
  // been shown and the only one they could mean.
  useEffect(() => {
    if (queue.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQueue((prev) => prev.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {queue.length > 0 && (
        // Fixed and centred, and transparent to the pointer except where a
        // banner actually is — the strip is the width of a reading column, and
        // the page under the empty half of it must stay clickable.
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          {[...queue].reverse().map((toast) => (
            <div key={toast.id} className="pointer-events-none w-full max-w-[30rem]">
              <ToastCard toast={toast} onClose={() => dismiss(toast.id)} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
