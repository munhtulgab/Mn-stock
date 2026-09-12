"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { EyeIcon, SaveIcon, TrashIcon } from "@/components/icons";
import type { AdminUserDetail } from "@/lib/adminUsers";

const FIELD =
  "mt-1 w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-muted";

/**
 * One account, as an administrator may change it.
 *
 * No current password is asked for anywhere here, unlike the reader's own
 * profile form. The proof is the administrator's session, and the case this
 * page exists for is precisely the one where the account's own password is
 * what has been lost.
 *
 * The cash balance sits with the account details rather than with the orders,
 * because setting it is not a trade — it is saying what the account holds,
 * which is the only honest way to fix a balance that drifted before the order
 * history could be trusted.
 */
export default function AdminUserForm({ user }: { user: AdminUserDetail }) {
  const [form, setForm] = useState({
    username: user.username,
    fullName: user.fullName ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    cashBalance: String(user.cash),
    role: user.role,
  });
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          role: form.role,
          cashBalance: Number(form.cashBalance),
          ...(newPassword ? { newPassword } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Хадгалж чадсангүй");
      toast({
        title: "Хадгаллаа",
        body: newPassword ? "Нууц үг солигдож, бүх сешн хаагдлаа." : undefined,
        variant: "success",
      });
      setNewPassword("");
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

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Устгаж чадсангүй");
      toast({ title: "Бүртгэл устлаа", variant: "success" });
      router.push("/admin/users");
      router.refresh();
    } catch (err) {
      toast({
        title: "Болсонгүй",
        body: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-app-border bg-app-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-app-muted">
          Хэрэглэгчийн нэр
          <input className={FIELD} value={form.username} onChange={set("username")} required />
        </label>
        <label className="text-xs text-app-muted">
          Овог нэр
          <input className={FIELD} value={form.fullName} onChange={set("fullName")} />
        </label>
        <label className="text-xs text-app-muted">
          И-мэйл
          <input className={FIELD} type="email" value={form.email} onChange={set("email")} />
        </label>
        <label className="text-xs text-app-muted">
          Утас
          <input className={FIELD} value={form.phone} onChange={set("phone")} />
        </label>
        <label className="text-xs text-app-muted">
          Мөнгөн үлдэгдэл (₮)
          <input
            className={FIELD}
            type="number"
            min={0}
            step="0.01"
            value={form.cashBalance}
            onChange={set("cashBalance")}
          />
        </label>
        <label className="text-xs text-app-muted">
          Шинэ нууц үг
          <span className="relative mt-1 block">
            <input
              className={`${FIELD} mt-0 pr-10`}
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Хоосон бол хэвээр"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Нууц үг нуух" : "Нууц үг харах"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted"
            >
              <EyeIcon off={!showPassword} size={16} />
            </button>
          </span>
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-app-text">
        <input
          type="checkbox"
          checked={form.role === "admin"}
          disabled={user.founder}
          onChange={(e) =>
            setForm((f) => ({ ...f, role: e.target.checked ? "admin" : "user" }))
          }
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)] disabled:opacity-50"
        />
        <span>
          Админ эрхтэй
          <span className="block text-xs text-app-muted">
            {user.founder
              ? "Анхны бүртгэл үргэлж админ байна — энэ эрхийг хасах боломжгүй."
              : "Системийн тохиргоо болон бүх хэрэглэгчийн мэдээлэлд хандана."}
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        <SaveIcon size={15} />
        {saving ? "Хадгалж байна…" : "Хадгалах"}
      </button>

      {!user.founder && (
        <div className="rounded-xl border border-app-negative/40 p-3">
          <p className="text-xs text-app-muted">
            Устгахад энэ хэрэглэгчийн захиалга, байрлал, хяналтын жагсаалт болон нэвтэрсэн
            сешн бүгд хамт устана. Буцаах боломжгүй.
          </p>
          {confirmingDelete ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="flex-1 rounded-xl bg-app-negative px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Бүрмөсөн устгах
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-text"
              >
                Болих
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-2 flex items-center gap-1.5 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-negative"
            >
              <TrashIcon size={15} /> Хэрэглэгчийг устгах
            </button>
          )}
        </div>
      )}
    </form>
  );
}
