import { SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-app-text">Зах зээлийн мэдээ</h1>
        <p className="text-xs text-app-muted mt-0.5">Сүүлийн 30 хоног</p>
      </div>
      <SkeletonRows count={6} />
    </div>
  );
}
