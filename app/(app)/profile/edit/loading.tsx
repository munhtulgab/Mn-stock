import { SkeletonBox } from "@/components/Skeleton";

/** Its own, so the form does not open on a skeleton titled Профайл. */
export default function Loading() {
  return (
    <div className="space-y-4 px-4 pt-6 pb-4">
      <span className="text-sm text-app-muted">← Профайл</span>
      <h1 className="text-xl font-bold text-app-text">Профайл засах</h1>
      <SkeletonBox className="h-[30rem] rounded-2xl" />
    </div>
  );
}
