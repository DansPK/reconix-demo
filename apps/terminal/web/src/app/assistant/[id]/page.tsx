import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { params: Promise<{ id: string }>; searchParams: DashboardSearchParams };

export default async function AssessmentAssistantPage({ params, searchParams }: Props) {
  const { id } = await params;
  return renderDashboardPage(searchParams, "assistant", id);
}
