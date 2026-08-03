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
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-lg font-semibold mb-4">Тохиргоо — нэвтрэх</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Нууц үг"
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-neutral-100 text-neutral-900 text-sm px-3 py-2 font-medium hover:bg-white disabled:opacity-50"
        >
          Нэвтрэх
        </button>
      </form>
    </div>
  );
}
