import {
  FilterBarSkeleton,
  HeadSkeleton,
  TableSkeleton,
} from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <HeadSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={10} />
    </div>
  );
}
