import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { searchParams: DashboardSearchParams };

export default async function ReportsPage({ searchParams }: Props) {
  return renderDashboardPage(searchParams, "reports");
}
