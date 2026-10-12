import { SkeletonBox } from "@/components/Skeleton";

/**
 * Its own, rather than Профайл's: a loading state is the folder's nearest
 * one, and without this the import opened on a skeleton titled Профайл.
 */
export default function Loading() {
  return (
    <div className="space-y-4 px-4 pt-6 pb-4">
      <span className="text-sm text-app-muted">← Профайл</span>
      <h1 className="text-xl font-bold text-app-text">Багц импортлох</h1>
      <SkeletonBox className="h-56 rounded-2xl" />
    </div>
  );
}
