/* The Local Assessment Viewer at `/`, rendered per request from the assessments the Reconix
   TUI saved (src/lib/data/store.ts). With no `?uid=` the Overview totals every saved run
   (derive-overall.ts), Findings lists them all, and Reports sums them up (derive-report.ts);
   `?uid=` opens one run (derive.ts). `?view=` is
   the open view, read by the client Viewer. There are no roles: signed in (src/proxy.ts and
   loadLibrary check), every view renders. The AI Assistant learns what it is about, which model answers
   (lib/assistant/models/resolve.ts) and what to suggest, from the data in scope
   (lib/assistant/prompts.ts). */
import type { AssistantInfo } from "@/components/assistant/types";
import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { assessmentsCards, overallReportCards, reportCards, runRow } from "@/components/dashboard/derive-report";
import { AssessmentsView } from "@/components/dashboard/assessments-view";
import { EmptyView } from "@/components/dashboard/empty-view";
import { FindingsView } from "@/components/dashboard/findings-view";
import { OverviewView } from "@/components/dashboard/overview-view";
import { ReportsView } from "@/components/dashboard/reports-view";
import { TopBar } from "@/components/dashboard/top-bar";
import { Viewer } from "@/components/dashboard/viewer";
import { KnowledgeView } from "@/components/knowledge/knowledge-view";
import { retentionDays } from "@/lib/assistant/history-store";
import { runRef, scopedViews, scopeOf } from "@/lib/assistant/insights";
import { welcomePrompts } from "@/lib/assistant/prompts";
import { assessmentView, libraryItem } from "@/lib/data/adapt";
import { clock } from "@/lib/data/format";
import { loadLibrary, shownDir, UID } from "@/lib/data/store";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  const [params, library] = await Promise.all([searchParams, loadLibrary()]);
  const wanted = typeof params.uid === "string" && UID.test(params.uid) ? params.uid : null;
  const views = library.assessments.map(assessmentView);
  const chosen = views.find((v) => v.uid === wanted) ?? null;
  const dash = chosen ? deriveDashboard(chosen) : null;
  const overall = !chosen && views.length ? deriveOverall(views) : null;
  const items = library.assessments.map(libraryItem);
  const dir = shownDir(library.dir);
  // Static demo: a fixed, local, canned "model" always answers — no picker, no network.
  const model = { configured: true, name: "Reconix", provider: "Built-in", local: true, reason: "" };
  const assistant: AssistantInfo = {
    scope: scopeOf(chosen),
    runs: scopedViews(views, null).map((v) => ({ ...runRef(v), status: v.status })),
    prompts: welcomePrompts(scopedViews(views, chosen?.uid ?? null)),
    retentionDays: retentionDays(),
    model,
  };
  const empty = <EmptyView dir={dir} problems={library.problems} compact />;
  const runs = views.map(runRow); // once: the Assessments view and the all-runs Report share it
  const report = chosen && dash ? reportCards(chosen, dash.findings, dash.cards.findings) : overall ? overallReportCards(views, overall.cards.findings, runs) : null;

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
      overview={
        dash ? (
          <OverviewView cards={dash.cards} />
        ) : overall ? (
          <OverviewView cards={overall.cards} />
        ) : (
          <EmptyView dir={dir} problems={library.problems} />
        )
      }
      assessments={runs.length ? <AssessmentsView data={assessmentsCards(runs)} /> : empty}
      findings={
        dash ? (
          <FindingsView key={dash.assessment.uid} findings={dash.findings} />
        ) : overall ? (
          <FindingsView key="all" findings={overall.findings} across={overall.runs} />
        ) : (
          empty
        )
      }
      reports={report ? <ReportsView key={chosen?.uid ?? "all"} data={report} /> : empty}
      knowledge={<KnowledgeView />}
      assistant={assistant}
    />
  );
}
