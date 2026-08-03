"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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
      {busy ? "Гарч байна..." : "Гарах"}
    </button>
  );
}
