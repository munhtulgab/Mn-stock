"use client";

import { useEffect, useState } from "react";

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
  const [state, setState] = useState<State>("checking");

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
      alert("Push notification тохируулагдаагүй байна (VAPID key алга).");
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
    } catch (err) {
      console.error("subscribe failed", err);
      setState("off");
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
    } catch (err) {
      console.error("unsubscribe failed", err);
      setState("on");
    }
  }

  if (state === "unsupported" || state === "checking") return null;

  if (state === "denied") {
    return (
      <span
        className="text-[11px] text-term-muted uppercase"
        title="Мэдэгдлийг браузерын тохиргооноос идэвхжүүлнэ үү"
      >
        🔕
      </span>
    );
  }

  return (
    <button
      onClick={state === "on" ? unsubscribe : subscribe}
      disabled={state === "busy"}
      title={
        state === "on"
          ? "Дохионы мэдэгдэл идэвхтэй — унтраахын тулд дарна уу"
          : "Дохио өөрчлөгдөх үед мэдэгдэл авах"
      }
      className={`text-[11px] uppercase tracking-wider border px-2 py-1 transition-colors disabled:opacity-50 ${
        state === "on"
          ? "border-term-amber text-term-amber bg-term-amber/10"
          : "border-term-border text-term-muted hover:border-term-amber hover:text-term-amber"
      }`}
    >
      {state === "on" ? "🔔 ON" : "🔔 OFF"}
    </button>
  );
}
