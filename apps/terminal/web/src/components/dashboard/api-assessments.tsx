/* The Assessments view, from the Core API (server component): the first rows
   (lib/api/assessments.ts loadAssessmentRows), then LiveAssessments keeps them fresh. No
   fallback: when the API is down or refuses, the view says what it said. */
import { ApiErrorNote } from "@/components/dashboard/api-findings";
import { LiveAssessments } from "@/components/dashboard/live-assessments";
import { AssessmentsSkeleton } from "@/components/dashboard/page-skeletons";
import type { ReportRunRow } from "@/components/dashboard/report-types";
import { ViewHeader } from "@/components/dashboard/view-header";
import { loadAssessmentRows } from "@/lib/api/assessments";
import { CoreApiError } from "@/lib/api/client";
import { DOCS } from "@/lib/docs-nav";
import { liveRefreshMs } from "@/lib/live-refresh";

/** How often the view asks again: the dashboard's live refresh, at most every 5 s; 0 = off. */
const LIVE_MS = 5_000;

const Sheet = ({ children }: { children: React.ReactNode }) => (
  <div className="dash-view dash-sheet">
    <ViewHeader title="Assessments" about="Assessments from the Core API." docsHref={DOCS.panelAssessments} />
    {children}
  </div>
);

/** Shown while the API answers (page.tsx streams the view behind it). */
export const AssessmentsLoading = () => <AssessmentsSkeleton />;

export async function ApiAssessments() {
  let rows: ReportRunRow[];
  try {
    rows = await loadAssessmentRows();
  } catch (e) {
    if (!(e instanceof CoreApiError)) throw e;
    return (
      <Sheet>
        <ApiErrorNote e={e} />
      </Sheet>
    );
  }
  const every = liveRefreshMs();
  return <LiveAssessments initial={rows} everyMs={every > 0 ? Math.min(every, LIVE_MS) : 0} />;
}
