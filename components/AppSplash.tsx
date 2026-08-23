/**
 * What fills the screen before the shell exists.
 *
 * There is a gap at the very start of a visit that none of the page skeletons
 * reach. `app/(app)/layout.tsx` opens the database connection and reads the
 * session cookie before it renders anything, and a `loading.tsx` inside a
 * segment sits *under* that segment's layout — so while the layout is
 * awaiting, there is no header to draw a placeholder for and no list to shape
 * one like. The browser has the document and nothing in it, which on a phone
 * is a blank white screen with a status bar on top. This is what goes there.
 *
 * A mark rather than a spinner. The wait is the app starting up, not a button
 * thinking, and a spinner in the middle of an empty screen is the thing that
 * makes a slow start feel broken.
 */
export default function AppSplash() {
  return (
    <div
      /* dvh, like the shell it stands in for, so it is the height of the
         viewport as it is right now rather than the height it would be with
         the browser's chrome hidden. */
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-app-bg px-6"
      role="status"
      aria-live="polite"
    >
      {/* On its own white tile, because the artwork has a white background
          baked into it and nothing to key out — the coin's rim and the dollar
          sign are white too, so making white transparent would punch holes
          through the middle of it. A tile reads as deliberate in both themes,
          the way an app icon does, where a bare white square on a near-black
          page reads as a picture that failed to load its own background.

          Fixed at 8rem with the file twice that, so it is sharp on a phone.
          Width and height are on the tag as well: they reserve the square
          before the image arrives, and without them the label under it would
          be centred on an empty screen and then jump. */}
      <div className="rounded-3xl bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element --
            `next/image` would route this through `/_next/image`, which is a
            request to the server — the thing this screen exists because we
            are waiting for. Out of `public/` it comes off the CDN. There is
            nothing for the optimiser to do either: it is already the exact
            size it is drawn at, and animated files are passed through
            untouched. */}
        <img
          src="/loading.webp"
          alt=""
          width={256}
          height={256}
          className="h-32 w-32"
          /* It is the only thing on the screen; there is nothing to defer it
             behind, and `async` decoding lets the first frame paint without
             holding up the layout around it. */
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <p className="text-sm text-app-muted">Зах зээлийн мэдээлэл ачаалж байна…</p>
    </div>
  );
}
