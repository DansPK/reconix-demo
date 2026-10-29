/* One run's facts for the report: what was assessed, by whom and when, its state and scope (as
   badges), then its plan steps with how far each got. */
import { EventBadge } from "@/components/dashboard/event-badge";
import { DashCard } from "@/components/dashboard/dash-card";
import type { DetailRow, PlanRow } from "@/components/dashboard/report-types";
import { StatusBadge } from "@/components/ui/status-badge";
import { toneColor } from "@/lib/status";
import { DOCS } from "@/lib/docs-nav";

export function ReportDetails({ details, plan }: { details: DetailRow[]; plan: PlanRow[] }) {
  return (
    <DashCard id="report-details" title="Assessment" docsHref={DOCS.dashboard} className="dash-panel" bodyClassName="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {details.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{d.label}</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[13px] text-foreground [overflow-wrap:anywhere]">
              {d.badge && <EventBadge badge={d.badge} />}
              {d.value && <span className="min-w-0">{d.value}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border pt-3">
        <h3 className="dash-subhead">Plan</h3>
        {plan.length ? (
          <ol aria-label="Plan steps" className="flex flex-col gap-1.5">
            {plan.map((p) => (
              <li key={p.key} className="dash-plan-row">
                <span className="min-w-0 truncate text-xs text-foreground" title={p.label}>
                  {p.label}
                </span>
                <StatusBadge meaning={p.state} className="justify-self-start" />
                <span className="dash-meter" aria-hidden>
                  <span data-bar-x style={{ width: `${p.pct}%`, background: toneColor(p.state.tone) }} />
                </span>
                <span className="text-right font-mono text-[11px] tabnums text-muted-foreground">{p.pct}%</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">No plan yet: the TUI drafts one after the scope is approved.</p>
        )}
      </div>
    </DashCard>
  );
}
