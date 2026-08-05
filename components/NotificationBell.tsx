"use client";

import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { BellIcon, SendIcon } from "./icons";

type State = "unsupported" | "checking" | "denied" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export default function NotificationBell() {
  const toast = useToast();
  const [state, setState] = useState<State>("checking");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    }
    check();
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast({
        variant: "error",
        title: "Push тохируулаагүй байна",
        body: "NEXT_PUBLIC_VAPID_PUBLIC_KEY тохируулаагүй тул бүртгүүлэх боломжгүй.",
      });
      return;
    }
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState("on");
      toast({ variant: "success", title: "Мэдэгдэл идэвхжлээ" });
    } catch (err) {
      console.error("subscribe failed", err);
      setState("off");
      toast({ variant: "error", title: "Бүртгүүлж чадсангүй" });
    }
  }

  async function unsubscribe() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast({ title: "Мэдэгдэл унтраалаа" });
    } catch (err) {
      console.error("unsubscribe failed", err);
      setState("on");
      toast({ variant: "error", title: "Унтраахад алдаа гарлаа" });
    }
  }

  /**
   * Proves the whole chain works now, instead of leaving the operator to
   * wonder through a day in which no signal happened to change.
   */
  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data: { ok?: boolean; message?: string } = await res.json().catch(() => ({}));
      const message = data.message ?? `Алдаа (${res.status}).`;
      setTestResult(message);
      toast({
        variant: data.ok ? "success" : "error",
        title: data.ok ? "Туршилтын мэдэгдэл илгээгдлээ" : "Илгээж чадсангүй",
        body: message,
      });
    } catch {
      setTestResult("Илгээх үед сүлжээний алдаа гарлаа.");
      toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
    } finally {
      setTesting(false);
    }
  }

  if (state === "checking") return null;

  // iOS only grants push to an installed PWA, so in a Safari tab the API is
  // simply absent. Saying nothing here is what makes it look like alerts are
  // broken, when the app has never been allowed to ask for them.
  if (state === "unsupported") {
    return (
      <div className="w-full flex items-center justify-between px-4 py-3.5">
        <span className="flex items-center gap-3 text-sm text-app-text">
          <BellIcon /> Push мэдэгдэл
        </span>
        <span className="text-xs text-app-muted text-right max-w-[60%]">
          Хөтөч дэмжихгүй байна — iPhone дээр эхлээд “Нүүр дэлгэцэд нэмэх”
        </span>
      </div>
    );
  }

  const label =
    state === "denied"
      ? "Хориглогдсон (браузерын тохиргооноос идэвхжүүлнэ үү)"
      : state === "on"
        ? "Идэвхтэй"
        : "Идэвхгүй";

  return (
    <>
      <button
        onClick={state === "on" ? unsubscribe : state === "denied" ? undefined : subscribe}
        disabled={state === "busy" || state === "denied"}
        className="w-full flex items-center justify-between px-4 py-3.5 disabled:opacity-70"
      >
        <span className="flex items-center gap-3 text-sm text-app-text">
          <BellIcon /> Push мэдэгдэл
        </span>
        <span
          className={`text-xs font-medium rounded-full px-2.5 py-1 ${
            state === "on" ? "bg-app-positive-bg text-app-positive" : "bg-app-bg text-app-muted"
          }`}
        >
          {label}
        </span>
      </button>

      {state === "on" && (
        <button
          onClick={sendTest}
          disabled={testing}
          className="w-full flex items-center justify-between px-4 py-3.5 disabled:opacity-70"
        >
          <span className="flex items-center gap-3 text-sm text-app-text">
            <SendIcon /> Туршилтын мэдэгдэл илгээх
          </span>
          <span className="text-xs text-app-muted text-right max-w-[55%]">
            {testing ? "Илгээж байна…" : (testResult ?? "Шалгах")}
          </span>
        </button>
      )}
    </>
  );
}
