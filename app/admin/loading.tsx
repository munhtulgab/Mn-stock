import {
  HeadSkeleton,
  PanelSkeleton,
  StatRowSkeleton,
  TableSkeleton,
  WeekDigestSkeleton,
} from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <HeadSkeleton />
      <StatRowSkeleton />
      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PanelSkeleton lines={6} />
        <PanelSkeleton lines={4} />
      </section>
      <WeekDigestSkeleton />
      <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TableSkeleton rows={6} />
        <PanelSkeleton lines={5} />
      </section>
    </div>
  );
}
