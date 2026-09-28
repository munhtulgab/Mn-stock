"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, and tells the server who this device's
 * alerts belong to.
 *
 * The second half is new. A push subscription is a device, and alerts about
 * a company somebody holds or watches go only to that person's devices — so
 * the server has to know whose a device is. A subscription sent once, when
 * alerts were turned on, cannot say that later: the person may since have
 * signed out, or someone else may have signed in. Re-sending the existing
 * subscription on each app open keeps it current, costs one small request,
 * and asks nothing of the reader — permission is only ever requested from
 * the switch on the profile page, never from here.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed", err);
    });

    if (!("PushManager" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      })
      .catch(() => {
        // Nothing to tell the reader: alerts keep working as they did, and
        // the next open tries again.
      });
  }, []);

  return null;
}
