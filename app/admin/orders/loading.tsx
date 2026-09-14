import { HeadSkeleton, TableSkeleton } from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <HeadSkeleton />
      <TableSkeleton rows={12} />
    </div>
  );
}
