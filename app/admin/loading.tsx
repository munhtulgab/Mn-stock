import { SkeletonBox } from "@/components/Skeleton";
import {
  HeadSkeleton,
  OrdersDigestSkeleton,
  PanelSkeleton,
  StatRowSkeleton,
  TableSkeleton,
} from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <HeadSkeleton />
      <StatRowSkeleton />
      {/* The quarter, read two ways, half each — and both at the height the
          taller of the pair settles on. */}
      <section className="grid gap-3 lg:grid-cols-2">
        <SkeletonBox className="h-[420px] rounded-2xl sm:h-[480px]" />
        <OrdersDigestSkeleton />
      </section>
      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TableSkeleton rows={15} />
        <div className="space-y-3">
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={5} />
        </div>
      </section>
    </div>
  );
}
