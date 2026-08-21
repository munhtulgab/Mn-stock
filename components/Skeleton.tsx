/**
 * Placeholders for what has not arrived yet.
 *
 * Shaped like the thing they stand in for rather than as generic bars: a row
 * skeleton carries an avatar, two lines of text and a right-hand figure
 * because that is what a holding row is, so nothing jumps sideways when the
 * data lands. The sweep itself is `.skeleton` in globals.css.
 */

export function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} aria-hidden />;
}

/** A card of list rows: avatar, name over ticker, figure over change. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <SkeletonBox className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-2.5 w-28" />
          </div>
          {/* The trend line's place, so the row does not reflow around one. */}
          <SkeletonBox className="hidden sm:block h-6 w-14 rounded-md" />
          <div className="space-y-2 items-end flex flex-col">
            <SkeletonBox className="h-3 w-14" />
            <SkeletonBox className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The portfolio card's place at the top of a page. */
export function SkeletonHero() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-app-border bg-app-card p-5">
      <SkeletonBox className="h-3 w-24" />
      <SkeletonBox className="mt-3 h-8 w-52 rounded-lg" />
      <SkeletonBox className="mt-4 h-6 w-40 rounded-full" />
    </div>
  );
}

/** The row of index cards under it. */
export function SkeletonIndices() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-app-border bg-app-card p-3 flex flex-col items-center gap-2"
        >
          <SkeletonBox className="h-2.5 w-12" />
          <SkeletonBox className="h-6 w-full rounded-md" />
          <SkeletonBox className="h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole page's worth, in the shape the page actually has: greeting, value
 * card, indices, then the list. The old version showed one rounded block and
 * a list of rows for every page, so every route loaded looking like the same
 * unrelated page.
 */
export function PageSkeleton({ title }: { title: string }) {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <h1 className="text-xl font-bold text-app-text">{title}</h1>
      <SkeletonHero />
      <SkeletonIndices />
      <SkeletonRows />
    </div>
  );
}
