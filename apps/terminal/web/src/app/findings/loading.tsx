import { DashboardSkeletonFrame, FindingsSkeleton } from "@/components/dashboard/page-skeletons";

export default function FindingsRouteLoading() {
  return (
    <DashboardSkeletonFrame active="findings" label="Loading findings…">
      <FindingsSkeleton />
    </DashboardSkeletonFrame>
  );
}
