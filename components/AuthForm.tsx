"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserIcon, LockIcon, PhoneIcon, MailIcon, EyeIcon } from "./icons";

function Field({
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-app-muted">{icon}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-app-border bg-app-card pl-11 pr-11 py-3.5 text-sm text-app-text placeholder:text-app-muted outline-none focus:border-brand"
      />
    </div>
  );
}

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Нэвтрэхэд алдаа гарлаа");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Сүлжээний алдаа гарлаа");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 mx-auto max-w-md">
      <div className="flex flex-col items-center mb-8">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="rounded-2xl mb-3" />
        <h1 className="text-2xl font-bold text-app-text">Тавтай морил</h1>
        <p className="text-app-muted text-sm mt-1">Дансандаа нэвтэрнэ үү</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field
          icon={<UserIcon />}
          placeholder="Хэрэглэгчийн нэр"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <div className="relative">
          <Field
            icon={<LockIcon />}
            type={showPassword ? "text" : "password"}
            placeholder="Нууц үг"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-app-muted"
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        {error && <p className="text-sm text-app-negative">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-brand text-black py-3.5 text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60 mt-2"
        >
          {loading ? "Түр хүлээнэ үү..." : "Нэвтрэх"}
        </button>
      </form>
      <p className="text-center text-sm text-app-muted mt-6">
        Бүртгэлгүй юу?{" "}
        <Link href="/signup" className="text-brand font-semibold">
          Бүртгүүлэх
        </Link>
      </p>
    </div>
  );
}

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError("Үйлчилгээний нөхцөлийг зөвшөөрнө үү");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Бүртгүүлэхэд алдаа гарлаа");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Сүлжээний алдаа гарлаа");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 mx-auto max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-app-text">Бүртгүүлэх</h1>
        <p className="text-app-muted text-sm mt-1">
          Данс үүсгэхэд ердөө хэдхэн минут хангалттай
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field
          icon={<UserIcon />}
          placeholder="Бүтэн нэр"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoFocus
        />
        <Field
          icon={<UserIcon />}
          placeholder="Хэрэглэгчийн нэр"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          icon={<MailIcon />}
          type="email"
          placeholder="И-мэйл хаяг"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          icon={<PhoneIcon />}
          type="tel"
          placeholder="Утасны дугаар"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="relative">
          <Field
            icon={<LockIcon />}
            type={showPassword ? "text" : "password"}
            placeholder="Нууц үг"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-app-muted"
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        <label className="flex items-start gap-2 text-xs text-app-muted pt-1">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          Би MSE Invest-ийн Үйлчилгээний нөхцөл, Нууцлалын бодлогыг зөвшөөрч байна
        </label>
        {error && <p className="text-sm text-app-negative">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-brand text-black py-3.5 text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-60 mt-2"
        >
          {loading ? "Түр хүлээнэ үү..." : "Бүртгэл үүсгэх"}
        </button>
      </form>
      <p className="text-center text-sm text-app-muted mt-6">
        Аль хэдийн бүртгэлтэй юу?{" "}
        <Link href="/login" className="text-brand font-semibold">
          Нэвтрэх
        </Link>
      </p>
    </div>
  );
}
