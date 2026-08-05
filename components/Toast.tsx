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
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

/**
 * What the app says back after you ask it for something.
 *
 * This used to be a small card sliding in above the tab bar, which is easy to
 * miss on a phone held at arm's length — a trade is confirmed, and the reader
 * is left looking for the confirmation. It is a card in the middle of the
 * screen now: one thing, said plainly, with a button to carry on. It still
 * clears itself, so nobody is made to dismiss a piece of good news.
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

const STYLES: Record<
  ToastVariant,
  { card: string; button: string; icon: React.ReactNode; iconColor: string }
> = {
  success: {
    card: "from-[#3a9fd8] to-[#37c07a]",
    button: "text-[#1c7fb8]",
    icon: <CheckIcon size={34} />,
    iconColor: "text-[#37c07a]",
  },
  error: {
    card: "from-[#e0574a] to-[#b8323f]",
    button: "text-[#c0392b]",
    icon: <AlertIcon size={34} />,
    iconColor: "text-[#c0392b]",
  },
  info: {
    card: "from-[#3f4a5c] to-[#232a36]",
    button: "text-[#2f3746]",
    icon: <InfoIcon size={34} />,
    iconColor: "text-[#3f4a5c]",
  },
};

/**
 * The scalloped disc the check sits in, drawn from a polar rosette rather
 * than assembled out of circles — ten lobes, sampled finely enough that
 * the outline reads as smooth at any size it is shown at.
 */
const ROSETTE_PATH = (() => {
  const lobes = 10;
  const points: string[] = [];
  for (let i = 0; i <= 360; i++) {
    const angle = (i / 360) * Math.PI * 2;
    const radius = 42 + 7 * Math.cos(lobes * angle);
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `${points.join(" ")} Z`;
})();

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const style = STYLES[toast.variant];

  useEffect(() => {
    const timer = setTimeout(onClose, toast.duration);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [toast.duration, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="status"
        aria-live={toast.variant === "error" ? "assertive" : "polite"}
        onClick={(e) => e.stopPropagation()}
        className={`animate-[toast-in_200ms_ease-out] relative w-full max-w-xs overflow-hidden rounded-3xl bg-linear-to-br ${style.card} px-6 pb-6 pt-8 text-center text-white shadow-2xl shadow-black/40`}
      >
        {/* The lighter disc in the corner, as on the reference. */}
        <span className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />

        <span className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <path d={ROSETTE_PATH} fill="rgba(255,255,255,0.94)" />
          </svg>
          <span className={`relative ${style.iconColor}`}>{style.icon}</span>
        </span>

        <h2 className="relative text-2xl font-bold leading-tight">{toast.title}</h2>
        {toast.body && (
          <p className="relative mt-1.5 text-sm leading-snug text-white/90 break-words">
            {toast.body}
          </p>
        )}

        <div className="relative mt-6 flex flex-col gap-2">
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                onClose();
              }}
              className="w-full rounded-full bg-white/20 py-3 text-base font-bold text-white active:scale-[0.98] transition-transform"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={onClose}
            autoFocus
            className={`w-full rounded-full bg-white py-3 text-base font-bold ${style.button} active:scale-[0.98] transition-transform`}
          >
            Үргэлжлүүлэх
          </button>
        </div>
      </div>
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
    // A card in the middle of the screen can only say one thing at a time;
    // anything raised while it is up waits its turn rather than stacking.
    setQueue((prev) => [...prev, toast].slice(-3));
  }, []);

  const dismiss = useCallback((id: number) => {
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const current = queue[0];

  return (
    <ToastContext.Provider value={show}>
      {children}
      {current && (
        <ToastCard
          key={current.id}
          toast={current}
          onClose={() => dismiss(current.id)}
        />
      )}
    </ToastContext.Provider>
  );
}
