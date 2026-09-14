import { SkeletonBox } from "@/components/Skeleton";

/**
 * What the administration sheet looks like before its data arrives.
 *
 * The app side has had one of these per route since it was built; this side
 * had none, and the difference was not cosmetic. Without a `loading` file a
 * route has no Suspense boundary for the router to swap to, so a click on a
 * section left the previous page on screen, fully drawn and completely inert,
 * until the server had finished — and every page here is `force-dynamic`, so
 * that is a real database round trip every time. It read as a dead button.
 *
 * It also costs the prefetch its job: Next prefetches the fallback of a
 * dynamic route, so with nothing to prefetch the bar's `prefetch` did nothing
 * at all. See `loading.md` in the Next docs — "the Fallback UI is prefetched,
 * making navigation immediate".
 *
 * Shaped like the page rather than as generic bars, for the same reason the
 * app side's are: a skeleton whose blocks sit where the real content will sit
 * does not make the page jump when it lands.
 */

/** The title and its controls, which every page under the bar carries. */
export function HeadSkeleton({ controls = 2 }: { controls?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0 space-y-2">
        <SkeletonBox className="h-6 w-44 rounded-lg" />
        <SkeletonBox className="h-3 w-64" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {Array.from({ length: controls }).map((_, i) => (
          <SkeletonBox key={i} className="h-11 w-32 rounded-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * The four figures across the top.
 *
 * Drawn at the height the real cards are and in the same grid, because the
 * row is the tallest thing on the dashboard — a placeholder shorter than it
 * would let everything below slide up and then back down.
 */
export function StatRowSkeleton() {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <SkeletonBox key={i} className="h-[152px] rounded-2xl" />
      ))}
    </section>
  );
}

/** A panel: its title, and a body of the given height. */
export function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-5">
      <SkeletonBox className="h-4 w-36" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <SkeletonBox className="h-3 w-32" />
            <SkeletonBox className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A panel whose body is a table: a head rule and then rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-app-border bg-app-card">
      <div className="px-5 py-4">
        <SkeletonBox className="h-4 w-40" />
      </div>
      <div className="divide-y divide-app-divider border-t border-app-divider">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <SkeletonBox className="h-3 w-24" />
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="ml-auto h-3 w-20" />
            <SkeletonBox className="hidden h-3 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The filter bar above a list.
 *
 * Worth drawing rather than skipping: it is a hundred and forty pixels tall
 * and sits between the heading and the table, so a placeholder without it
 * puts the rows where they are not going to be and then drops them when the
 * real page lands.
 */
export function FilterBarSkeleton() {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
        <SkeletonBox className="h-9 w-9 rounded-xl" />
        <SkeletonBox className="h-4 w-24" />
        <SkeletonBox className="ml-auto h-10 w-24 rounded-full" />
      </div>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="mt-1.5 h-[42px] rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The weekly digest card, at the height it lands at.
 *
 * Taller on a phone than on a laptop, because the ring and the curve sit side
 * by side from `sm` up and stack below it — a single height would be wrong at
 * one of the two widths, and this block is what everything below it is
 * resting on.
 */
export function WeekDigestSkeleton() {
  return <SkeletonBox className="h-[640px] rounded-2xl sm:h-[480px]" />;
}
