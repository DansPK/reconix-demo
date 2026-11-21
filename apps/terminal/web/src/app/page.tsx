import { type DashboardSearchParams, renderDashboardPage } from "@/components/dashboard/dashboard-page";

type Props = { searchParams: DashboardSearchParams };

export default async function Home({ searchParams }: Props) {
  return renderDashboardPage(searchParams, "overview");
}
