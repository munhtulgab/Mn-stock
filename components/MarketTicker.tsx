"use client";

import { useEffect } from "react";

/**
 * Asks the server to check prices every couple of minutes while the market
 * is open and this app is in front of somebody.
 *
 * This was meant to be a cron. Vercel's Hobby plan allows a project two
 * scheduled jobs and fires them once a day, so declaring the ninety-two
 * firings the session needs made the whole deployment invalid — which is how
 * a fortnight of fixes ended up sitting on the branch, built and pushed and
 * never served. The schedule is back to what the plan allows, and this
 * carries the intent in the meantime: whenever anybody has the app open
 * during a session, the market is watched, the stored rows stay level with
 * it, and a recommendation that turns is noticed then rather than at
 * tomorrow's sync.
 *
 * It costs one request every two minutes per open app, and the server does
 * nothing at all beyond a single call to the quote feed unless a price has
 * actually moved.
 */

/** Ulaanbaatar, matching the schedule this stands in for. */
const OPENS = "09:59";
const CLOSES = "13:01";
const EVERY_MS = 2 * 60 * 1000;

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ulaanbaatar",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ulaanbaatar",
  weekday: "short",
});

/**
 * Read in Ulaanbaatar rather than on the device: a reader in another zone is
 * still looking at a Mongolian trading session, and their own clock would
 * either start this in the middle of the night or never.
 */
function inSession(now: Date): boolean {
  const day = WEEKDAY.format(now);
  if (day === "Sat" || day === "Sun") return false;
  const time = CLOCK.format(now);
  return time >= OPENS && time <= CLOSES;
}

export default function MarketTicker() {
  useEffect(() => {
    let stopped = false;

    const tick = () => {
      // Nothing while the tab is in the background: a phone in a pocket
      // should not be waking up to poll a shut exchange.
      if (stopped || document.hidden || !inSession(new Date())) return;
      void fetch("/api/prices/tick", { method: "POST", keepalive: true }).catch(
        () => {
          // A missed check is a check missed, not an error worth showing.
        },
      );
    };

    tick();
    const timer = setInterval(tick, EVERY_MS);
    // Coming back to the app is itself a moment worth checking, and the
    // interval may have been throttled to nothing while it was away.
    document.addEventListener("visibilitychange", tick);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return null;
}
