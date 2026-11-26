import { AssessmentsSkeleton, DashboardSkeletonFrame } from "@/components/dashboard/page-skeletons";

export default function AssessmentsRouteLoading() {
  return (
    <DashboardSkeletonFrame active="assessments" label="Loading assessments…">
      <AssessmentsSkeleton />
    </DashboardSkeletonFrame>
  );
}
