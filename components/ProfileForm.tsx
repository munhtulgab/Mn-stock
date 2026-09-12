"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import Avatar from "./Avatar";
import { CloseIcon, EditIcon, EyeIcon, SaveIcon, PhoneIcon, MailIcon } from "./icons";

function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.2" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * Shrinks a chosen picture to a square of {@link AVATAR_SIZE} before it ever
 * leaves the browser. A phone camera produces four megabytes; what the app
 * needs is a 56px disc, and a couple of hundred pixels of it is enough for a
 * retina screen. Cropped from the centre so a portrait is not squashed.
 */
const AVATAR_SIZE = 256;

function toSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Зураг боловсруулж чадсангүй"));
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Зургийг уншиж чадсангүй"));
    };
    img.src = url;
  });
}

export default function ProfileForm({
  username,
  fullName,
  email,
  phone,
  avatar,
}: {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  avatar: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ username, fullName, email, phone });
  /**
   * The credentials, kept apart from the rest of the form.
   *
   * They are not saved unless they are touched: an empty new password means
   * the password is not being changed, and the current one is asked for only
   * where something that decides how the account is signed into has moved.
   */
  const [creds, setCreds] = useState({ current: "", next: "", again: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [picture, setPicture] = useState(avatar);
  const [uploading, setUploading] = useState(false);

  const displayName = fullName || username;

  const renaming = form.username.trim() !== username;
  const rekeying = creds.next !== "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setError("Нэрээ оруулна уу");
      return;
    }
    // Checked here as well as on the server, which cannot see the second box
    // at all: the two together are the reader saying what they meant.
    if (rekeying && creds.next !== creds.again) {
      setError("Шинэ нууц үг хоёр талдаа таарахгүй байна");
      return;
    }
    if ((renaming || rekeying) && !creds.current) {
      setError("Одоогийн нууц үгээ оруулна уу");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          avatar: picture,
          ...(renaming || rekeying
            ? { currentPassword: creds.current, newPassword: creds.next }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body.error || "Хадгалахад алдаа гарлаа";
        setError(message);
        toast({ variant: "error", title: "Хадгалж чадсангүй", body: message });
        return;
      }
      setCreds({ current: "", next: "", again: "" });
      setEditing(false);
      toast({
        variant: "success",
        title: rekeying ? "Нууц үг солигдлоо" : "Профайл хадгалагдлаа",
        body: rekeying ? "Бусад төхөөрөмж дээрх нэвтрэлт цуцлагдлаа." : undefined,
      });
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
        <div className="flex flex-col items-center gap-2">
          <label className="relative cursor-pointer">
            <Avatar src={picture} name={displayName} size={72} />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-app-card bg-brand text-black">
              <CameraIcon size={14} />
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setUploading(true);
                setError(null);
                try {
                  setPicture(await toSquareDataUrl(file));
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-app-muted">
              {uploading ? "Боловсруулж байна…" : "Зураг солих"}
            </span>
            {picture && (
              <button
                type="button"
                onClick={() => setPicture("")}
                className="text-app-negative font-medium"
              >
                Устгах
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2.5">
          {/* The name the account is signed into, so it sits above the rest
              rather than among the details. The @ is drawn beside the box
              rather than typed into it — it is punctuation, not a character
              of the name, and a reader who types it would be renamed to
              "@thing". */}
          <label className="flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-4 focus-within:border-brand">
            <span className="text-sm text-app-muted">@</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Хэрэглэгчийн нэр"
              autoComplete="username"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-app-text outline-none"
            />
          </label>
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
        {/* Left blank, nothing here is saved: the password only changes when
            a new one is typed. The current one is asked for the moment
            either credential moves — see the route. */}
        <div className="space-y-2.5 rounded-xl border border-app-border/70 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-text">Нууц үг солих</span>
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              aria-label={showPasswords ? "Нууц үгийг нуух" : "Нууц үгийг харуулах"}
              className="text-app-muted"
            >
              <EyeIcon off={showPasswords} />
            </button>
          </div>
          <input
            type={showPasswords ? "text" : "password"}
            value={creds.next}
            onChange={(e) => setCreds((c) => ({ ...c, next: e.target.value }))}
            placeholder="Шинэ нууц үг"
            autoComplete="new-password"
            className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
          />
          {rekeying && (
            <input
              type={showPasswords ? "text" : "password"}
              value={creds.again}
              onChange={(e) => setCreds((c) => ({ ...c, again: e.target.value }))}
              placeholder="Шинэ нууц үгээ давтах"
              autoComplete="new-password"
              className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
            />
          )}
          {(renaming || rekeying) && (
            <input
              type={showPasswords ? "text" : "password"}
              value={creds.current}
              onChange={(e) => setCreds((c) => ({ ...c, current: e.target.value }))}
              placeholder="Одоогийн нууц үг"
              autoComplete="current-password"
              className="w-full rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand"
            />
          )}
          <p className="text-[11px] text-app-muted">
            {renaming && !rekeying
              ? "Хэрэглэгчийн нэрээ солихын тулд одоогийн нууц үгээ баталгаажуулна уу."
              : rekeying
                ? "Хадгалснаар бусад төхөөрөмж дээрх нэвтрэлт цуцлагдана."
                : "Хоосон орхивол нууц үг хэвээр үлдэнэ."}
          </p>
        </div>
        {error && <p className="text-xs text-app-negative">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm({ username, fullName, email, phone });
              setCreds({ current: "", next: "", again: "" });
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
        <Avatar src={avatar} name={displayName} size={56} />
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

      <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-sm text-app-muted">
            <PhoneIcon /> Утасны дугаар
          </span>
          <span className="text-sm font-medium text-app-text">{phone || "—"}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="flex items-center gap-2.5 text-sm text-app-muted">
            <MailIcon /> И-мэйл
          </span>
          <span className="text-sm font-medium text-app-text">{email || "—"}</span>
        </div>
      </div>
    </div>
  );
}
