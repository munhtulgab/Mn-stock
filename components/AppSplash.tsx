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
 * A mark rather than a spinner, and no caption under it. The wait is the app
 * starting up, and an animation that is plainly running says that on its own;
 * a line of text saying so as well is a second thing to read on a screen that
 * exists because there is nothing to read yet. The label is still there for a
 * screen reader, which has no animation to go by.
 */
export default function AppSplash() {
  return (
    <div
      /* dvh, like the shell it stands in for, so it is the height of the
         viewport as it is right now rather than the height it would be with
         the browser's chrome hidden. */
      className="flex min-h-dvh items-center justify-center bg-app-bg px-6"
      role="status"
      aria-label="Ачаалж байна"
    >
      {/* On its own white tile, because the artwork has a white background
          baked into it and nothing to key out — the coin's rim and the dollar
          sign are white too, so making white transparent would punch holes
          through the middle of it. A tile reads as deliberate in both themes,
          the way an app icon does, where a bare white square on a near-black
          page reads as a picture that failed to load its own background.

          Fixed at 8rem with the file twice that, so it is sharp on a phone.
          Width and height are on the tag as well, so the square is the size
          it will be before the image arrives rather than collapsing to
          nothing and pushing the tile open when it lands. */}
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
          /* The fetch itself is started from the document head, before this
             markup has even been streamed — see the preload in the root
             layout. These two say the same thing to the browser once it gets
             here, and cost nothing if the file is already on its way. */
          decoding="async"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
