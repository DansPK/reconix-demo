/* Left-hand panel on the Report page: assessment metadata grid (code, target, template, status,
   started, duration, operator, scope) followed by its Plan steps and completion bars. */
import { DashCard } from "@/components/dashboard/dash-card";
import { plural } from "@/components/dashboard/derive-shared";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ApiOverview } from "@/lib/api/reports";
import { day, duration, hourMinute, minutesLimit, parseTime } from "@/lib/data/format";
import type { AssessmentView } from "@/lib/data/view-types";
import { DOCS } from "@/lib/docs-nav";
import { RUN_STATUS, scopeMeaning, STEP_STATUS, toneColor } from "@/lib/status";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-xs text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const fallbackStatus = (s: string) =>
  s === "COMPLETED" ? RUN_STATUS.Completed : s === "CANCELLED" ? RUN_STATUS.Stopped : s === "DRAFT" ? RUN_STATUS.New : RUN_STATUS.Running;

export function ReportAssessmentCard({ overview, view }: { overview: ApiOverview; view: AssessmentView | null }) {
  const a = overview.assessment;
  const createdMs = view?.createdMs ?? parseTime(a.created_at) ?? 0;
  const started = createdMs ? `${hourMinute(createdMs)} · ${day(createdMs)}` : "—";
  const elapsed = overview.duration_seconds ? duration(overview.duration_seconds) : view ? duration(view.spanSec) : "—";
  const budget = view?.scope?.windowMinutes ? ` of ${minutesLimit(view.scope.windowMinutes)}` : "";
  const scope = view?.scope ?? null;
  const runMeaning = view ? RUN_STATUS[view.status] : fallbackStatus(a.assessment_status);

  return (
    <DashCard id="report-assessment" title="Assessment" docsHref={DOCS.assessmentGuide} bodyClassName="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Field label="Assessment">
          <span className="font-mono">{a.engagement_code}</span>
        </Field>
        <Field label="Target">
          <span className="font-mono">{overview.targets.join(", ") || "—"}</span>
        </Field>
        <Field label="Template">{view?.template ?? "—"}</Field>
        <Field label="Status">
          <StatusBadge meaning={runMeaning} />
        </Field>
        <Field label="Started">
          <span className="font-mono tabnums">{started}</span>
        </Field>
        <Field label="Duration">
          <span className="font-mono tabnums">
            {elapsed}
            {budget}
          </span>
        </Field>
        <Field label="Operator">
          <span className="font-mono">{view?.operator || "—"}</span>
        </Field>
        <Field label="Scope">
          <div className="flex flex-col items-start gap-1">
            <StatusBadge meaning={scopeMeaning(scope?.status ?? null)} />
            {scope && (
              <span className="text-[11px] text-muted-foreground">
                {plural(scope.include.length, "in scope", "in scope")} · {scope.exclude.length} excluded
              </span>
            )}
          </div>
        </Field>
      </dl>

      <div className="border-t border-border pt-3">
        <p className="dash-subhead">Plan</p>
        {view?.phases.length ? (
          <ol aria-label="Plan steps" className="dash-phases">
            {view.phases.map((p) => {
              const meaning = STEP_STATUS[p.status];
              return (
                <li key={p.key} className="dash-phase">
                  <span className={p.status === "pending" ? "truncate text-muted-foreground" : "truncate text-foreground"} title={p.label}>
                    {p.label}
                  </span>
                  <StatusBadge meaning={meaning} className="justify-self-start" />
                  <span className="dash-meter" role="meter" aria-label={`${p.label} progress`} aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
                    <span data-bar-x style={{ width: `${p.pct}%`, background: toneColor(meaning.tone) }} />
                  </span>
                  <span className="text-right font-mono text-[11px] tabnums text-muted-foreground">{p.pct}%</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">
            {overview.plan_step_count > 0
              ? `${overview.plan_step_done_count}/${overview.plan_step_count} plan steps finished.`
              : "No plan yet: the TUI builds one after the scope is approved."}
          </p>
        )}
      </div>
    </DashCard>
  );
}
