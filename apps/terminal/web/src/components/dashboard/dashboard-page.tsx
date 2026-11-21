/* Shared server renderer for the dashboard routes (`/`, `/assistant`, `/assessments`, `/findings`,
   `/reports`, `/knowledge`). Keeps all views mounted in <Viewer> so the WebGL globe and
   AssistantProvider stay alive across switches while each view has its own clean path URL. */
import { Suspense } from "react";
import { redirect } from "next/navigation";

import type { AssistantInfo } from "@/components/assistant/types";
import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { runRow } from "@/components/dashboard/derive-report";
import { ApiFindings, FindingsLoading } from "@/components/dashboard/api-findings";
import { ApiReports, ReportsLoading } from "@/components/dashboard/api-reports";
import { EmptyView } from "@/components/dashboard/empty-view";
import { LiveAssessments } from "@/components/dashboard/live-assessments";
import { OverviewView } from "@/components/dashboard/overview-view";
import { TopBar } from "@/components/dashboard/top-bar";
import { parseView, type View } from "@/components/dashboard/view-name";
import { Viewer } from "@/components/dashboard/viewer";
import { KnowledgeView } from "@/components/knowledge/knowledge-view";
import { isAssessmentId } from "@/lib/api/findings";
import { graphData } from "@/lib/api/knowledge";
import { loadApiLibrary } from "@/lib/api/library";
import { activeModelSummary } from "@/lib/api/models";
import { requireSignedIn } from "@/lib/auth/guard";
import { runRef, scopedViews, scopeOf } from "@/lib/assistant/insights";
import { welcomePrompts } from "@/lib/assistant/prompts";
import { assessmentView, libraryItem } from "@/lib/data/adapt";
import { clock } from "@/lib/data/format";
import { type Library, loadLibrary, shownDir, UID } from "@/lib/data/store";
import { liveRefreshMs } from "@/lib/live-refresh";

export type DashboardSearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function renderDashboardPage(
  searchParams: DashboardSearchParams,
  routeView: View = "overview",
  pathRunId: string | null = null,
) {
  await requireSignedIn();
  const params = await searchParams;
  const rawUid = pathRunId && UID.test(pathRunId) ? pathRunId : typeof params.uid === "string" && UID.test(params.uid) ? params.uid : null;
  const rawAssessment = pathRunId && isAssessmentId(pathRunId) ? pathRunId : isAssessmentId(params.assessment) ? params.assessment : null;
  const wanted = rawUid;
  const apiAssessment = rawAssessment;

  const loadLib = async (): Promise<Library> => {
    if (process.env.RECONIX_MOCK === "1") return loadLibrary();
    try {
      return await loadApiLibrary();
    } catch {
      return loadLibrary();
    }
  };

  // Run library loading, active model lookup, and (on /knowledge) SSR graph data concurrently.
  const [library, model, initialKnowledge] = await Promise.all([
    loadLib(),
    // its summary only (no API key comes back); without the Core API the assistant says so
    activeModelSummary().catch((error: unknown) => ({
      configured: false,
      name: "",
      provider: "",
      local: false,
      reason: error instanceof Error ? error.message.slice(0, 600) : "The Core API is not running.",
    })),
    routeView === "knowledge" ? graphData().catch(() => null) : Promise.resolve(null),
  ]);

  const views = library.assessments.map(assessmentView);
  const queryView = typeof params.view === "string" ? parseView(params.view) : null;
  const onAssessments = routeView === "assessments" || queryView === "assessments";
  const onReports = routeView === "reports" || queryView === "reports";
  const matched =
    views.find(
      (v) =>
        (wanted && v.uid === wanted) ||
        (apiAssessment && (v.coreId === apiAssessment || v.uid === apiAssessment)),
    ) ?? null;
  // `/reports` with nothing asked for opens the first assessment's report; a run that was asked
  // for but isn't there stays put, so the page says so (QAL-003) instead of showing another one
  if (onReports && !matched && !apiAssessment && !wanted) {
    const firstReport = views[0];
    if (firstReport) redirect(`/reports/${encodeURIComponent(firstReport.coreId || firstReport.uid)}`);
  }
  const chosen = onAssessments ? null : matched;

  const dash = chosen ? deriveDashboard(chosen) : null;
  const overall = !chosen && views.length ? deriveOverall(views) : null;
  const selectedAssessment = onAssessments ? null : (apiAssessment ?? (chosen && (chosen.coreId || chosen.uid)));
  const items = library.assessments.map(libraryItem);
  const dir = shownDir(library.dir);

  const assistant: AssistantInfo = {
    scope: scopeOf(chosen),
    runs: scopedViews(views, null).map((v) => ({ ...runRef(v), status: v.status })),
    prompts: welcomePrompts(scopedViews(views, chosen?.uid ?? null)),
    retentionDays: 0, // the Core API keeps conversations until they are closed
    model,
  };

  const empty = <EmptyView dir={dir} problems={library.problems} compact />;
  const missing = Boolean((wanted || apiAssessment) && !matched && views.length > 0);
  const runs = views.map(runRow);
  const every = liveRefreshMs();

  const needFindings = routeView === "findings" || routeView === "overview";
  const needReports = routeView === "reports" || routeView === "overview";

  return (
    <Viewer
      topBar={
        <TopBar
          dash={dash}
          overall={overall}
          items={items}
          dir={dir}
          renderedAt={clock(library.readAt)}
          skipped={library.problems}
        />
      }
      notice={
        missing ? (
          <p role="status" className="dash-missing-run">
            That assessment isn&apos;t in this folder — showing all runs.
          </p>
        ) : null
      }
      overview={
        dash ? (
          <OverviewView cards={dash.cards} />
        ) : overall ? (
          <OverviewView cards={overall.cards} />
        ) : (
          <EmptyView dir={dir} problems={library.problems} />
        )
      }
      assessments={
        runs.length ? (
          <LiveAssessments initial={runs} everyMs={every > 0 ? Math.min(every, 5000) : 0} />
        ) : (
          empty
        )
      }
      findings={
        needFindings ? (
          <Suspense fallback={<FindingsLoading />}>
            <ApiFindings assessmentId={selectedAssessment} savedRun={selectedAssessment ? null : wanted} />
          </Suspense>
        ) : null
      }
      reports={
        needReports ? (
          <Suspense fallback={<ReportsLoading selected={selectedAssessment !== null} />}>
            <ApiReports assessmentId={selectedAssessment} />
          </Suspense>
        ) : null
      }
      knowledge={<KnowledgeView initialData={initialKnowledge} />}
      assistant={assistant}
    />
  );
}
