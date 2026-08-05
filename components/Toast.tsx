"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

/**
 * Transient feedback.
 *
 * The app used to say "it worked" with `alert()` — a modal that blocks the
 * page, looks nothing like the rest of it, and has to be dismissed before
 * anything else can happen — or with a line of text under a button that is
 * easy to miss on a phone. A toast says the same thing without taking the
 * screen, and shows how long it has left rather than vanishing unannounced.
 */

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  /** Second line. Optional: a one-line toast is a legitimate shape. */
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
  success: 3_500,
  info: 4_500,
  // Something went wrong is worth reading twice.
  error: 6_500,
};

/** Beyond this the stack covers the screen it is reporting on. */
const MAX_VISIBLE = 3;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/**
 * Raises a toast. Safe to call from anywhere under the provider; outside it
 * the call is a no-op rather than a crash, so a component can be rendered in
 * isolation without dragging the provider along.
 */
export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  return useMemo(() => show ?? (() => {}), [show]);
}

const STYLES: Record<
  ToastVariant,
  { rail: string; disc: string; bar: string; icon: React.ReactNode }
> = {
  success: {
    rail: "bg-app-positive",
    disc: "bg-white/20 text-white",
    bar: "bg-white/40",
    icon: <CheckIcon size={20} />,
  },
  error: {
    rail: "bg-app-negative",
    disc: "bg-white/20 text-white",
    bar: "bg-white/40",
    icon: <AlertIcon size={20} />,
  },
  // Not the brand colour: it is the same green as "positive", so a neutral
  // message would have been indistinguishable from a confirmation. A card
  // surface with a brand-tinted disc says "read this" without claiming
  // anything went right.
  info: {
    rail: "bg-app-elevated border border-app-border",
    disc: "bg-brand-light text-brand",
    bar: "bg-brand",
    icon: <InfoIcon size={20} />,
  },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const style = STYLES[toast.variant];
  const [remaining, setRemaining] = useState(1);

  // The bar is driven from a timer rather than a CSS animation so it stays in
  // step with the dismissal even when the tab is throttled in the background.
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => {
      const left = 1 - (Date.now() - started) / toast.duration;
      setRemaining(left > 0 ? left : 0);
      if (left <= 0) onClose();
    }, 50);
    return () => clearInterval(tick);
  }, [toast.duration, onClose]);

  return (
    <div
      role="status"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto overflow-hidden rounded-2xl shadow-lg shadow-black/20 ${style.rail} ${
        toast.variant === "info" ? "text-app-text" : "text-white"
      } animate-[toast-in_180ms_ease-out]`}
    >
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.disc}`}
        >
          {style.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight">{toast.title}</div>
          {toast.body && (
            <div className="mt-0.5 text-xs leading-snug opacity-90 break-words">
              {toast.body}
            </div>
          )}
        </div>

        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onClose();
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              toast.variant === "info" ? "bg-brand text-black" : "bg-white/20"
            } active:scale-95 transition-transform`}
          >
            {toast.action.label}
          </button>
        )}

        <button
          onClick={onClose}
          aria-label="Хаах"
          className="shrink-0 opacity-70 active:opacity-100"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {/* How long is left, so a message never simply disappears mid-read. */}
      <div className="h-1 w-full bg-black/20">
        <div
          className={`h-full ${style.bar} transition-[width] duration-75 ease-linear`}
          style={{ width: `${remaining * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
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
    setToasts((prev) => [...prev, toast].slice(-MAX_VISIBLE));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Above the bottom bar and clear of the home indicator; the wrapper
          ignores taps so the page underneath stays usable. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
