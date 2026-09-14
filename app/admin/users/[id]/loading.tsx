import { HeadSkeleton, PanelSkeleton, TableSkeleton } from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <HeadSkeleton />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={6} />
        </div>
        <div className="space-y-3">
          <PanelSkeleton lines={5} />
          <TableSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
