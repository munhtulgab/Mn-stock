"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Num from "@/components/Num";
import { EditIcon, EyeIcon, SaveIcon, TrashIcon } from "@/components/icons";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { AdminUserDetail } from "@/lib/adminUsers";

const FIELD =
  "mt-1 w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-muted";

/**
 * One account, as an administrator may change it.
 *
 * It reads before it writes. Every field on this page can move somebody
 * else's money or lock them out of their own account, and a page that opens
 * with all of them in editable boxes invites a stray keystroke into one — the
 * balance especially, which is a number field a scroll wheel will happily
 * change while somebody is scrolling past it. So the details are shown, and
 * Засварлах is what turns them into a form.
 *
 * Устгах lives inside that form rather than beside the read view, for the
 * same reason: this panel answers "who is this?" until it is asked to be the
 * panel that changes them.
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
  const initial = () => ({
    username: user.username,
    fullName: user.fullName ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    cashBalance: String(user.cash),
    role: user.role,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  /** Back to what is stored, so Болих leaves nothing half-typed behind. */
  function stopEditing() {
    setForm(initial());
    setNewPassword("");
    setShowPassword(false);
    setEditing(false);
  }

  /**
   * The changes that are not just a corrected spelling: a password nobody but
   * this administrator will know, a balance rewritten by hand, the run of the
   * whole installation handed over or taken back. Each is asked about; a
   * changed phone number is not, because a form that asks every time is a
   * form whose question stops being read.
   */
  const weighty = [
    newPassword !== "" && "нууц үг солих (бүх сешн хаагдана)",
    form.role !== user.role &&
      (form.role === "admin" ? "админ эрх олгох" : "админ эрхийг хасах"),
    Number(form.cashBalance) !== user.cash &&
      `үлдэгдлийг ${money(user.cash)} → ${money(Number(form.cashBalance))} болгох`,
  ].filter((line): line is string => typeof line === "string");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (weighty.length > 0) {
      setConfirmingSave(true);
      return;
    }
    void save();
  }

  async function save() {
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
      setShowPassword(false);
      setConfirmingSave(false);
      setEditing(false);
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
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-app-border bg-app-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-app-text">
          Бүртгэлийн мэдээлэл
        </h2>
        {editing && (
          <span className="shrink-0 text-[13px] text-app-muted">засварлаж байна</span>
        )}
      </div>

      {editing ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-app-muted">
              Хэрэглэгчийн нэр
              {/* Locked on the system administrator: the name is what makes
                  that account the administrator and what makes it
                  undeletable, so the server refuses to change it. Better not
                  to offer the field than to offer one that always fails. */}
              <input
                className={`${FIELD} disabled:opacity-60`}
                value={form.username}
                onChange={set("username")}
                disabled={user.founder}
                required
              />
            </label>
            <label className="text-xs text-app-muted">
              Овог нэр
              <input className={FIELD} value={form.fullName} onChange={set("fullName")} />
            </label>
            <label className="text-xs text-app-muted">
              И-мэйл
              <input
                className={FIELD}
                type="email"
                value={form.email}
                onChange={set("email")}
              />
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
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-app-muted"
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
                  ? "Системийн админ. Энэ эрхийг хасах, бүртгэлийг устгах боломжгүй."
                  : "Системийн тохиргоо болон бүх хэрэглэгчийн мэдээлэлд хандана."}
              </span>
            </span>
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={saving}
              style={{ color: "var(--on-brand)" }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <SaveIcon size={15} />
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </button>
            <button
              type="button"
              onClick={stopEditing}
              disabled={saving}
              className="w-full rounded-xl border border-app-border px-3 py-2.5 text-sm font-semibold text-app-text disabled:opacity-60"
            >
              Болих
            </button>
          </div>

          {!user.founder && (
            <div className="rounded-xl border border-app-negative/40 p-3">
              <p className="text-xs text-app-muted">
                Устгахад энэ хэрэглэгчийн захиалга, хувьцаа, хяналтын жагсаалт болон
                нэвтэрсэн сешн бүгд хамт устана. Буцаах боломжгүй.
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-app-border px-3 py-2 text-sm font-semibold text-app-negative"
              >
                <TrashIcon size={15} /> Хэрэглэгчийг устгах
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <dl className="text-sm">
            <Line label="Хэрэглэгчийн нэр">@{user.username}</Line>
            <Line label="Овог нэр" muted={!user.fullName}>
              {user.fullName || "оруулаагүй"}
            </Line>
            <Line label="И-мэйл" muted={!user.email}>
              {user.email || "оруулаагүй"}
            </Line>
            <Line label="Утас" muted={!user.phone}>
              {user.phone || "оруулаагүй"}
            </Line>
            <Line label="Мөнгөн үлдэгдэл">
              <Num value={user.cash} digits={0} suffix="₮" />
            </Line>
            <Line label="Эрх">
              {user.role === "admin"
                ? user.founder
                  ? "Системийн админ"
                  : "Админ"
                : "Хэрэглэгч"}
            </Line>
          </dl>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-border px-3 py-2.5 text-sm font-semibold text-app-text hover:bg-app-elevated"
          >
            <EditIcon />
            Засварлах
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmingSave}
        title="Өөрчлөлтийг хадгалах уу?"
        body={<>Энэ бүртгэлд дараах өөрчлөлт орно. Хэрэглэгчид мэдэгдэхгүй.</>}
        detail={
          <ul className="space-y-1">
            {weighty.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-app-muted">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        }
        confirmLabel="Хадгалах"
        busy={saving}
        onCancel={() => setConfirmingSave(false)}
        onConfirm={() => void save()}
      />

      <ConfirmDialog
        open={confirmingDelete}
        danger
        title={`@${user.username}-ийг бүрмөсөн устгах уу?`}
        body={<>Бүртгэл болон түүнд харьяалагдах бүх өгөгдөл устана. Буцаах боломжгүй.</>}
        detail={
          <ul className="space-y-1">
            <li>{user.orderCount} захиалга</li>
            <li>{user.positionCount} хувьцаа</li>
            <li>{money(user.cash)} үлдэгдэл</li>
            <li>{user.sessions} нэвтэрсэн сешн</li>
          </ul>
        }
        confirmLabel="Устгах"
        busy={saving}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
      />
    </form>
  );
}

/** One stored detail, read-only: the label left, the value right. */
function Line({
  label,
  muted,
  children,
}: {
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-app-divider py-2.5 last:border-0">
      <dt className="shrink-0 text-app-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right font-semibold ${
          muted ? "font-normal text-app-muted" : "text-app-text"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

const money = (value: number) =>
  `${value.toLocaleString("mn-MN", { maximumFractionDigits: 0 })}₮`;
