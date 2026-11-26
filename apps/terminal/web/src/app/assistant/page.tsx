import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { searchParams: DashboardSearchParams };

export default async function AssistantPage({ searchParams }: Props) {
  return renderDashboardPage(searchParams, "assistant");
}
