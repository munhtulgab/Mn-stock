"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertIcon } from "@/components/icons";

/**
 * The warning that stands between an administrator and somebody else's data.
 *
 * Every action in this area acts on an account that is not the person's own,
 * and most of them cannot be undone: an order removed, an account and
 * everything under it, a correction that moves a balance. So none of them go
 * through on one tap, and none of them go through on a vague question either
 * — the dialog says what will happen to what, in the words of the thing being
 * changed, and the button says the verb rather than "OK".
 *
 * A dialog rather than the inline panel this replaces. Inline confirmation
 * asks in the same place, at the same size, in the same colour as the button
 * that opened it, which on a page of rows that all look alike is easy to
 * answer without reading. This one takes the screen: there is one question on
 * it, and answering means choosing between two named buttons.
 *
 * Not `window.confirm`, for the reasons that always apply to it — it cannot
 * carry the figures, some installs suppress it, and in a PWA it wears the
 * browser's clothes rather than the app's.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  detail,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** What will happen, in a sentence. */
  body: React.ReactNode;
  /** The figures it will happen to, if there are any worth showing. */
  detail?: React.ReactNode;
  confirmLabel: string;
  /** Irreversible: the confirming button goes red. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape answers "no", which is the answer Escape means everywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Focus lands on Болих rather than on the button that does the thing, so a
  // stray Enter or Space closes the dialog instead of confirming it.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Only a click that both starts and ends on the backdrop dismisses —
      // otherwise a drag that begins inside the card and releases outside it
      // closes the dialog on someone who was selecting text in it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-app-border bg-app-card p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 shrink-0 ${danger ? "text-app-negative" : "text-app-warn"}`}
          >
            <AlertIcon size={22} />
          </span>
          <div className="min-w-0">
            <h3 id="confirm-title" className="font-bold text-app-text">
              {title}
            </h3>
            <p className="mt-1 text-sm text-app-muted">{body}</p>
          </div>
        </div>

        {detail && (
          <div className="rounded-2xl bg-app-bg p-3 text-sm text-app-text">{detail}</div>
        )}

        <div className="flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-app-border px-3 py-2.5 text-sm font-semibold text-app-text"
          >
            Болих
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
              danger ? "bg-app-negative" : "bg-brand"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
