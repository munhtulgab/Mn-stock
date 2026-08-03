import { SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-xl font-bold text-app-text">Мэдэгдэл</h1>
      <SkeletonRows count={5} />
    </div>
  );
}
