import { SkeletonBox, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-app-text">Зах зээл</h1>
      <SkeletonBox className="h-12 rounded-2xl" />
      <SkeletonRows count={8} />
    </div>
  );
}
