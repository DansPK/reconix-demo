import { AssistantSkeleton, DashboardSkeletonFrame } from "@/components/dashboard/page-skeletons";

export default function AssistantRouteLoading() {
  return (
    <DashboardSkeletonFrame active="assistant" noBar label="Loading AI Assistant…">
      <AssistantSkeleton />
    </DashboardSkeletonFrame>
  );
}
