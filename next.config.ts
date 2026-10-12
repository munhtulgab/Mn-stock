import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The splash animation, kept in the browser once it has been fetched.
   *
   * Files in `public/` are served with `max-age=0, must-revalidate`, so every
   * launch would spend a round trip asking whether a picture that has not
   * changed has changed — at the one moment the app is already waiting on the
   * database and has nothing on screen. A week of `max-age` and the second
   * launch paints it out of the cache.
   *
   * Not `immutable`, and the name has no hash in it: the trade is that a
   * replacement takes up to a week to reach somebody who has the old one.
   * Give a new animation a new filename if that ever matters.
   */
  headers() {
    return Promise.resolve([
      {
        source: "/loading.webp",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ]);
  },

  /**
   * Тохиргоо became Багц импортлох, at its own address under Профайл. The old
   * one still arrives somewhere — a bookmark, the app's own history, a link
   * in a message — rather than at a 404.
   *
   * Temporary, not permanent: a 308 is kept by the browser for good, and an
   * address this page has already moved from once should stay free to move
   * again without every phone that ever opened it remembering the old rule.
   */
  redirects() {
    return Promise.resolve([
      { source: "/settings", destination: "/profile/import", permanent: false },
    ]);
  },
};

export default nextConfig;
