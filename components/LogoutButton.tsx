"use client";

import { useState } from "react";
import { LogoutIcon } from "./icons";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // The number on the app's icon was this account's alerts, and the
      // next person to sign in on this phone has no business seeing it.
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge().catch(() => {});
      window.location.href = "/login";
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 rounded-2xl border border-app-negative/30 bg-app-negative-bg text-app-negative font-semibold py-3.5 text-sm disabled:opacity-60"
    >
      {busy ? (
        "Гарч байна..."
      ) : (
        <>
          <LogoutIcon /> Гарах
        </>
      )}
    </button>
  );
}
