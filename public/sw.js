const CACHE_NAME = "mse-terminal-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal network-first fetch handler — required for PWA installability
// criteria (a controlling service worker with a fetch handler). We don't do
// offline caching of dynamic/price data since it goes stale immediately.
//
// GET only, and deliberately so. Re-issuing `event.request` is safe for a
// request with no body and is not safe for one that has: on iOS the body of a
// re-fetched POST goes missing, which is how a statement PDF that was plainly
// attached reached the server as an empty request and came back "attach a
// statement". Anything with a body is left for the browser to send itself.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MSE Terminal", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "MSE Terminal";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag || "mse-signal",
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      showUnread(data.unread).catch(() => {}),
    ]),
  );
});

/**
 * The number on the app's icon, the way a native app carries one.
 *
 * iOS puts no count on a web app's icon of its own accord, whatever arrives:
 * the app has to set it, and when a push lands there is no page open to do
 * that. So the worker does, from the count the server sent along — what the
 * reader on this device has not opened yet, this alert included. An open
 * window is told as well, so its bell moves with the icon instead of waiting
 * until it is looked at again.
 *
 * A push without a count leaves the icon alone; it was sent to a device
 * nobody is signed in on.
 */
async function showUnread(unread) {
  if (typeof unread !== "number") return;
  try {
    if ("setAppBadge" in self.navigator) {
      if (unread > 0) await self.navigator.setAppBadge(unread);
      else await self.navigator.clearAppBadge();
    }
  } catch {
    // Refused without notification permission, or not supported: the
    // banner is what matters, and it is shown either way.
  }
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "unread", unread });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
