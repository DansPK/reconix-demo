import { DashboardSkeletonFrame, ReportsListSkeleton } from "@/components/dashboard/page-skeletons";

export default function ReportsRouteLoading() {
  return (
    <DashboardSkeletonFrame active="reports" label="Loading reports…">
      <ReportsListSkeleton />
    </DashboardSkeletonFrame>
  );
}
