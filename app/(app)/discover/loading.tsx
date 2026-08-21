import { SkeletonHeader, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <SkeletonHeader />
      <SkeletonRows count={8} />
    </div>
  );
}
