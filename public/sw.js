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

  event.waitUntil(self.registration.showNotification(title, options));
});

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
