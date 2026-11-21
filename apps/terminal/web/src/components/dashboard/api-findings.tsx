/* The Findings view, from the Core API (server component): GET /assessments for assessment names
   and GET /findings for one assessment (`?assessment=<uuid>`) or every one. When the API is down
   or refuses, the person sees what it said; nothing falls back to the saved files. A saved
   run (`?uid=`, from the Overview's links) has no Core API id, so it gets a note saying so and
   the list of every assessment. */
import { FindingsView } from "@/components/dashboard/findings-view";
import { FindingsSkeleton } from "@/components/dashboard/page-skeletons";
import { EmptyNote } from "@/components/ui/empty-note";
import { apiFindingRows } from "@/lib/api/adapt";
import { CoreApiError } from "@/lib/api/client";
import { type ApiAssessment, type ApiFinding, listAssessments, listFindings } from "@/lib/api/findings";

export const Shell = ({ children }: { children: React.ReactNode }) => <div className="dash-view dash-findings">{children}</div>;

export const ApiErrorNote = ({ e }: { e: CoreApiError }) => (
  <EmptyNote status className="dash-findings-api-error">
    {e.message} <span className="font-mono">({e.code})</span>
  </EmptyNote>
);

/** Shown while the API answers (page.tsx streams the view behind it). */
export const FindingsLoading = () => <FindingsSkeleton />;

const NOT_FOUND = <EmptyNote status>The Core API has no assessment with that id. Pick another one.</EmptyNote>;

export async function ApiFindings({ assessmentId, savedRun = null }: { assessmentId: string | null; savedRun?: string | null }) {
  let assessments: ApiAssessment[];
  try {
    assessments = await listAssessments();
  } catch (e) {
    if (!(e instanceof CoreApiError)) throw e;
    return (
      <Shell>
        <ApiErrorNote e={e} />
      </Shell>
    );
  }

  const known = assessmentId === null || assessments.some((a) => a.assessment_id === assessmentId);

  let findings: ApiFinding[] = [];
  let failed: CoreApiError | null = null;
  if (known) {
    try {
      findings = await listFindings(assessmentId);
    } catch (e) {
      if (!(e instanceof CoreApiError)) throw e;
      failed = e;
    }
  }
  if (!known || failed?.code === "ASSESSMENT_NOT_FOUND")
    return <Shell>{NOT_FOUND}</Shell>;
  if (failed)
    return (
      <Shell>
        <ApiErrorNote e={failed} />
      </Shell>
    );

  const notice = savedRun ? (
    <p role="status" className="dash-findings-saved-run mb-3 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
      Findings come from the Core API, which doesn&apos;t know the saved run <span className="font-mono text-foreground">{savedRun}</span>: showing every
      Core API assessment.
    </p>
  ) : null;
  return (
    <FindingsView
      key={assessmentId ?? "all"}
      findings={apiFindingRows(findings, assessmentId ? null : assessments)}
      across={assessmentId ? null : assessments.length}
      picker={notice}
      linkedFromSavedRun={savedRun !== null}
    />
  );
}
