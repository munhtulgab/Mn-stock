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

/**
 * One row's worth of delay, so the wave runs down the list.
 *
 * Passed as a custom property rather than a class because there is no fixed
 * number of rows and Tailwind cannot generate a class per index.
 */
function row(index: number): React.CSSProperties {
  return { "--row": index } as React.CSSProperties;
}

/**
 * The header every page carries: its name, and the three controls beside it.
 *
 * This was not drawn at all, so the moment the page arrived a title appeared
 * out of nothing and three buttons pushed in from the right. The controls are
 * the sizes PageHeader actually renders — a 68px pill for the day/night
 * switch and two 40px circles.
 */
export function SkeletonHeader() {
  return (
    <div className="flex items-center justify-between gap-3 skeleton-stagger">
      <div className="min-w-0 space-y-2" style={row(0)}>
        <SkeletonBox className="h-3 w-20" />
        <SkeletonBox className="h-6 w-40 rounded-lg" />
      </div>
      <div className="flex items-center gap-2 shrink-0" style={row(1)}>
        <SkeletonBox className="h-10 w-[4.25rem] rounded-full" />
        <SkeletonBox className="h-10 w-10 rounded-full" />
        <SkeletonBox className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

/** A card of list rows: avatar, name over ticker, figure over change. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden skeleton-stagger">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3" style={row(i)}>
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

/**
 * The portfolio card's place at the top of a page.
 *
 * Taller than the sum of its lines, because the real card is: it carries the
 * bull and the bear at its edges, and a placeholder that stops at the text
 * left the page visibly growing when it landed.
 */
export function SkeletonHero() {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-app-border bg-app-card p-5 min-h-[9.5rem] skeleton-stagger"
      style={row(0)}
    >
      <SkeletonBox className="h-3 w-24" />
      <SkeletonBox className="mt-3 h-8 w-52 rounded-lg" />
      <SkeletonBox className="mt-4 h-6 w-40 rounded-full" />
    </div>
  );
}

/** The row of index cards under it. */
export function SkeletonIndices() {
  return (
    <div className="grid grid-cols-3 gap-2 skeleton-stagger">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-app-border bg-app-card p-3 flex flex-col items-center gap-2"
          style={row(i + 1)}
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
 * A whole page's worth, in the shape the page actually has: the header, the
 * value card, the indices, then the list. The old version showed one rounded
 * block and a list of rows for every page, so every route loaded looking like
 * the same unrelated page.
 *
 * `title` is gone. It named the page in text while everything around it was a
 * grey block, which is the one thing a skeleton should not do — it made the
 * home screen announce "Зах зээл" for as long as it was loading, and that is
 * the name of a different tab.
 */
export function PageSkeleton() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <SkeletonHeader />
      <SkeletonHero />
      <SkeletonIndices />
      <SkeletonRows />
    </div>
  );
}
