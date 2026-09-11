/**
 * The unread alert count as this browser last knew it.
 *
 * A tab navigation keeps the page's JavaScript alive, and what the reader
 * has just done to their alerts is known there — so it is worth carrying
 * across rather than asking the server about again.
 *
 * The bell used to render the number its page was built with and then ask,
 * which put the old figure on screen for the length of a round trip: clear
 * four alerts, tap Нүүр, and the bell reads the count from before the
 * clearing until the answer lands. Reading it from here instead, the bell
 * is right in the first frame, and the round trip only has to confirm it.
 *
 * It is a hint, not a record. Nothing but a browsing session lives in it:
 * a full page load starts it empty and the server's own count stands. Its
 * shape suits `useSyncExternalStore`, which is what reads it.
 */

let known: number | null = null;
const listeners = new Set<() => void>();

/** What this browser last knew, or nothing if it has not been told yet. */
export function readUnread(): number | null {
  return known;
}

/** Nothing: a server render has no browser to have been told anything. */
export function unreadOnServer(): null {
  return null;
}

export function setUnread(next: number): void {
  if (known === next) return;
  known = next;
  for (const listener of listeners) listener();
}

export function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
