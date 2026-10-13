/*
 * This worker is here for push and nothing else: the alert banner, the count
 * on the icon, and opening the app when a banner is tapped.
 *
 * It used to sit in front of every request too, re-fetching each one and
 * handing the response on — said to be needed to make the app installable,
 * which it is not any more, and with a cache fallback that never had anything
 * in it. All it did was put every page load inside the worker's lifetime,
 * and that is the likeliest reason the app stuck on its start-up splash on
 * the first launch after an update: the new worker took over the moment it
 * had installed, which stops the old one, and on iOS a page the old one was
 * still answering can stop where it got to. Requests now go to the network
 * as they would with no worker at all.
 *
 * And a new version waits its turn. `skipWaiting` swapped workers under an
 * app that was still loading; without it, the old worker finishes the launch
 * it is part of and the new one takes over once the app has been closed —
 * the next launch, which for push is soon enough.
 */

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
