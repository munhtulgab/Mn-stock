"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { CloseIcon, EditIcon, SaveIcon } from "./icons";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function ProfileForm({
  username,
  fullName,
  email,
  phone,
}: {
  username: string;
  fullName: string;
  email: string;
  phone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName, email, phone });

  const displayName = fullName || username;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError("Нэрээ оруулна уу");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body.error || "Хадгалахад алдаа гарлаа";
        setError(message);
        toast({ variant: "error", title: "Хадгалж чадсангүй", body: message });
        return;
      }
      setEditing(false);
      toast({ variant: "success", title: "Профайл хадгалагдлаа" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="rounded-3xl bg-app-card border border-app-border p-5 space-y-3"
      >
        <div className="flex items-center justify-center rounded-full bg-brand text-white font-bold w-14 h-14 text-lg shrink-0 mx-auto">
          {initials(displayName)}
        </div>
        <div className="space-y-2.5">
          <input
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder="Бүтэн нэр"
            className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="Утасны дугаар"
            className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
          />
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="И-мэйл"
            className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
          />
        </div>
        {error && <p className="text-xs text-app-negative">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm({ fullName, email, phone });
              setError(null);
              setEditing(false);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-app-border text-app-text text-sm font-semibold py-2.5"
          >
            <CloseIcon size={15} /> Болих
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-black text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            <SaveIcon size={15} /> {saving ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="rounded-3xl bg-app-card border border-app-border p-5 flex items-center gap-4">
        <div className="flex items-center justify-center rounded-full bg-brand text-white font-bold w-14 h-14 text-lg shrink-0">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-app-text truncate">{displayName}</div>
          <div className="text-sm text-app-muted truncate">@{username}</div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Профайл засах"
          className="w-9 h-9 rounded-full bg-app-elevated flex items-center justify-center text-app-muted active:scale-95 transition-transform shrink-0"
        >
          <EditIcon />
        </button>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm text-app-muted">Утасны дугаар</span>
          <span className="text-sm font-medium text-app-text">{phone || "—"}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-sm text-app-muted">И-мэйл</span>
          <span className="text-sm font-medium text-app-text">{email || "—"}</span>
        </div>
      </div>
    </div>
  );
}
