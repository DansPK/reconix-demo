import { DashboardSkeletonFrame, ReportsSkeleton } from "@/components/dashboard/page-skeletons";

export default function ReportDetailLoading() {
  return (
    <DashboardSkeletonFrame active="reports" label="Loading report…">
      <ReportsSkeleton />
    </DashboardSkeletonFrame>
  );
}
