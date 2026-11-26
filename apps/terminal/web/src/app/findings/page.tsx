import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { searchParams: DashboardSearchParams };

export default async function FindingsPage({ searchParams }: Props) {
  return renderDashboardPage(searchParams, "findings");
}
