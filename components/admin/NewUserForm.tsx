"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { PlusIcon } from "@/components/icons";

const FIELD =
  "w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-muted";

/**
 * Opens an account for somebody who cannot open it themselves.
 *
 * Folded away until asked for: the list is what this page is, and a form
 * standing permanently above it would put the rarest thing first.
 */
export default function NewUserForm() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    phone: "",
    role: "user",
  });
  const router = useRouter();
  const toast = useToast();

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Бүртгэл үүсгэж чадсангүй");
      toast({ title: "Бүртгэл үүслээ", body: `@${form.username}`, variant: "success" });
      setForm({ username: "", password: "", fullName: "", phone: "", role: "user" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Болсонгүй",
        body: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: "linear-gradient(142deg, var(--admin-fill-from), var(--admin-fill-to))" }}
        className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
      >
        <PlusIcon size={15} /> Хэрэглэгч нэмэх
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-2xl border border-app-border bg-app-card p-5 space-y-3"
    >
      <h2 className="text-sm font-semibold text-app-text">Шинэ хэрэглэгч</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className={FIELD}
          placeholder="Хэрэглэгчийн нэр"
          value={form.username}
          onChange={set("username")}
          autoComplete="off"
          required
        />
        <input
          className={FIELD}
          placeholder="Нууц үг"
          type="text"
          value={form.password}
          onChange={set("password")}
          autoComplete="new-password"
          required
        />
        <input
          className={FIELD}
          placeholder="Овог нэр"
          value={form.fullName}
          onChange={set("fullName")}
        />
        <input className={FIELD} placeholder="Утас" value={form.phone} onChange={set("phone")} />
      </div>
      <label className="flex items-center gap-2 text-sm text-app-text">
        <input
          type="checkbox"
          checked={form.role === "admin"}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.checked ? "admin" : "user" }))}
          className="h-4 w-4 accent-[var(--color-brand)]"
        />
        Админ эрхтэй
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          style={{ color: "var(--on-brand)" }}
          className="flex-1 rounded-xl bg-brand px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Үүсгэж байна…" : "Үүсгэх"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm font-semibold text-app-text"
        >
          Болих
        </button>
      </div>
    </form>
  );
}
