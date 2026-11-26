import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { searchParams: DashboardSearchParams };

export default async function AssessmentsPage({ searchParams }: Props) {
  return renderDashboardPage(searchParams, "assessments");
}
