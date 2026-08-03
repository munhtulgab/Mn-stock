"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Нэвтрэхэд алдаа гарлаа");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pt-16 pb-4">
      <h1 className="text-lg font-bold text-app-text mb-1">Тохиргоо хязгаарлагдмал</h1>
      <p className="text-sm text-app-muted mb-4">Нэвтрэх нууц үгээ оруулна уу.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Нууц үг"
          className="w-full rounded-xl border border-app-border bg-app-card px-4 py-3 text-sm text-app-text outline-none focus:border-brand"
        />
        {error && <p className="text-xs text-app-negative">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand text-black text-sm font-semibold px-3 py-3 disabled:opacity-50"
        >
          Нэвтрэх
        </button>
      </form>
    </div>
  );
}
