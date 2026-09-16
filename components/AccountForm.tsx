"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import Avatar from "./Avatar";
import { CloseIcon, EyeIcon, SaveIcon, TrashIcon } from "./icons";

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

/**
 * The account, as the person it belongs to may change it.
 *
 * Open, always. It used to be the second half of the profile card: the
 * details were printed read-only and a bare pencil disc in the corner turned
 * them into a form. That disc was the only way to a Хадгалах button anywhere
 * on the reader's side of the app, and it carried no word — so a reader
 * looking for somewhere to save what they had come to change found a page of
 * text with nothing on it to press.
 *
 * So the form lives on Тохиргоо now, which is the page that name promises,
 * and it is a form from the moment it is opened. There is nothing here that
 * costs anything to look at, and the one control that could be tripped by
 * accident — the password — is still ignored while it is left empty.
 *
 * Профайл keeps the card. It answers "who am I signed in as"; this answers
 * "and change it", and Засах on that card is the way across.
 */
export default function AccountForm({
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

  const displayName = form.fullName || form.username || username;
  const renaming = form.username.trim() !== username;
  const rekeying = creds.next !== "";
  /** Whether anything is actually different from what is stored. */
  const touched =
    renaming ||
    rekeying ||
    picture !== avatar ||
    form.fullName !== fullName ||
    form.email !== email ||
    form.phone !== phone;

  function reset() {
    setForm({ username, fullName, email, phone });
    setCreds({ current: "", next: "", again: "" });
    setPicture(avatar);
    setError(null);
  }

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
      toast({
        variant: "success",
        title: rekeying ? "Нууц үг солигдлоо" : "Хадгаллаа",
        body: rekeying ? "Бусад төхөөрөмж дээрх нэвтрэлт цуцлагдлаа." : undefined,
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-3 rounded-2xl border border-app-border bg-app-card p-5"
    >
      <h2 className="font-semibold text-app-text">Бүртгэлийн мэдээлэл</h2>

      <div className="flex flex-col items-center gap-2">
        <label className="relative cursor-pointer">
          <Avatar src={picture} name={displayName} size={72} />
          <span className="absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-app-card bg-brand text-black">
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
              className="inline-flex items-center gap-1 font-medium text-app-negative"
            >
              <TrashIcon size={13} />
              Устгах
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {/* The name the account is signed into, so it sits above the rest
            rather than among the details. The @ is drawn beside the box
            rather than typed into it — it is punctuation, not a character of
            the name, and a reader who types it would be renamed to
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

      {/* Left blank, nothing here is saved: the password only changes when a
          new one is typed. The current one is asked for the moment either
          credential moves — see the route. */}
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

      {/* Хадгалах is live whether or not anything has moved. Greyed out until
          the form is dirty would be the tidier rule and the wrong one here:
          this button exists because a reader went looking for somewhere to
          save and found nothing, and a disabled button is the same answer in
          a different colour. Saving an unchanged account writes the same
          values back and says so, which costs a round trip and settles the
          question the reader was asking.

          Болих is the one that waits. Before anything has been typed it would
          undo nothing, and it would take half the width of the button that
          does something. */}
      <div className="flex gap-2">
        {touched && (
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-app-border py-2.5 text-sm font-semibold text-app-text disabled:opacity-50"
          >
            <CloseIcon size={15} /> Болих
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          <SaveIcon size={15} /> {saving ? "Хадгалж байна..." : "Хадгалах"}
        </button>
      </div>
    </form>
  );
}
