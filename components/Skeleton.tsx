export function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-app-elevated ${className}`} />;
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <SkeletonBox className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBox className="h-3 w-16" />
            <SkeletonBox className="h-2.5 w-28" />
          </div>
          <div className="space-y-2 items-end flex flex-col">
            <SkeletonBox className="h-3 w-14" />
            <SkeletonBox className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ title }: { title: string }) {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <h1 className="text-xl font-bold text-app-text">{title}</h1>
      <SkeletonBox className="h-28 rounded-3xl" />
      <SkeletonRows />
    </div>
  );
}
