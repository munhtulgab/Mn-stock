"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { CloseIcon, EditIcon, SaveIcon } from "./icons";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function Avatar({
  src,
  name,
  size,
}: {
  src: string;
  name: string;
  size: number;
}) {
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      className="flex items-center justify-center rounded-full bg-brand text-white font-bold shrink-0"
    >
      {initials(name)}
    </div>
  );
}

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
  const [form, setForm] = useState({ fullName, email, phone });
  const [picture, setPicture] = useState(avatar);
  const [uploading, setUploading] = useState(false);

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
        body: JSON.stringify({ ...form, avatar: picture }),
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
