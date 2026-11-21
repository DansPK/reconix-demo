import { DashboardSkeletonFrame, KnowledgeSkeleton } from "@/components/dashboard/page-skeletons";

export default function KnowledgeRouteLoading() {
  return (
    <DashboardSkeletonFrame active="knowledge" noBar label="Loading security knowledge…">
      <KnowledgeSkeleton />
    </DashboardSkeletonFrame>
  );
}
