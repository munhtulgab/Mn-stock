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
      <h1 className="text-sm uppercase tracking-wider text-term-amber mb-4 border-b border-term-border pb-2">
        Restricted // Authentication Required
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="PASSWORD"
          className="w-full bg-black border border-term-border px-3 py-2 text-sm outline-none focus:border-term-amber placeholder:text-term-muted"
        />
        {error && <p className="text-xs text-term-red">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-term-amber text-term-amber text-xs uppercase tracking-wide px-3 py-2 font-bold hover:bg-term-amber hover:text-black transition-colors disabled:opacity-50"
        >
          Нэвтрэх
        </button>
      </form>
    </div>
  );
}
