import { HeadSkeleton, PanelSkeleton } from "@/components/admin/AdminSkeleton";

export default function Loading() {
  return (
    <div className="space-y-5">
      <HeadSkeleton controls={0} />
      <PanelSkeleton lines={8} />
      <PanelSkeleton lines={5} />
      <PanelSkeleton lines={4} />
    </div>
  );
}
