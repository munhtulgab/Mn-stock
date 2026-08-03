import { SkeletonBox } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <SkeletonBox className="h-4 w-16" />
      <div className="flex justify-between">
        <div className="space-y-2">
          <SkeletonBox className="h-6 w-24" />
          <SkeletonBox className="h-3 w-32" />
        </div>
        <SkeletonBox className="h-8 w-28" />
      </div>
      <SkeletonBox className="h-20 rounded-2xl" />
      <SkeletonBox className="h-72 rounded-2xl" />
      <SkeletonBox className="h-40 rounded-2xl" />
    </div>
  );
}
