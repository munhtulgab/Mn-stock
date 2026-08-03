import { SkeletonBox, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <h1 className="text-xl font-bold text-app-text">Профайл</h1>
      <SkeletonBox className="h-24 rounded-3xl" />
      <SkeletonRows count={3} />
    </div>
  );
}
