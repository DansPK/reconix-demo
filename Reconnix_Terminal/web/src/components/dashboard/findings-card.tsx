/* Findings by Severity: a stacked bar of the severity mix, one row per severity (badge, count,
   share; a row with findings opens Findings filtered to it), the review state, and the top CVSS
   findings (each opens itself in Findings). Always four rows, Critical, High, Medium, Low (the
   whole scale), each even at 0; the bar, its accessible name and the total count those four.
   Severity uses the TUI's scale (lib/status.ts SEVERITY_META). */
import { DashCard } from "@/components/dashboard/dash-card";
import { plural } from "@/components/dashboard/derive-shared";
import type { FindingsSlice } from "@/components/dashboard/overview-types";
import { ViewLink } from "@/components/dashboard/view-link";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { DOCS } from "@/lib/docs-nav";
import { FINDING_REVIEW, SEVERITY_META } from "@/lib/status";

/** `id` names the card's heading; it must differ per view, since every view stays mounted. */
export function FindingsCard({ data, id = "findings-card" }: { data: FindingsSlice; id?: string }) {
  const { confirmed, needsReview, closed } = data.review;
  return (
    <DashCard
      id={id}
      title="Findings by Severity"
      docsHref={DOCS.findings}
      meta={plural(data.total, "finding")}
      className="dash-panel h-full"
      bodyClassName="flex flex-col gap-3"
    >
      {/* the mix as one stacked bar (the rows below are its legend) */}
      <div role="img" aria-label={`Findings by severity: ${data.words}`} className="dash-stack">
        {data.total ? (
          data.severity
            .filter((s) => s.count > 0)
            .map((s) => (
              <span
                key={s.level}
                data-bar-x
                title={`${SEVERITY_META[s.level].label}: ${s.count} (${s.share}%)`}
                style={{ flexGrow: s.frac, background: SEVERITY_META[s.level].color }}
              />
            ))
        ) : (
          <span className="dash-stack-empty" />
        )}
      </div>

      <ul aria-label="Findings per severity" className="flex flex-col">
        {data.severity.map((s) => (
          <li key={s.level} className="dash-sev-row">
            <SeverityBadge level={s.level} className="justify-self-start" />
            <span className="dash-meter" aria-hidden>
              <span data-bar-x style={{ width: `${s.share}%`, background: SEVERITY_META[s.level].color }} />
            </span>
            <span key={s.count} className="text-right text-[15px] leading-none tabnums text-foreground" data-countup>
              {s.count}
            </span>
            <span className="text-right font-mono text-[11px] tabnums text-muted-foreground">{s.share}%</span>
            {s.count > 0 && (
              <ViewLink
                view="findings"
                filters={{ sev: s.level }}
                label={`Show the ${plural(s.count, `${s.level.toLowerCase()} finding`)}`}
                className="absolute inset-0 rounded-md"
              >
                <span className="sr-only">{s.level.toLowerCase()}</span>
              </ViewLink>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1.5" aria-label="Review state">
        <StatusBadge meaning={FINDING_REVIEW.confirmed} label={`${confirmed} confirmed`} />
        <StatusBadge meaning={FINDING_REVIEW.review} label={`${needsReview} need review`} />
        {closed > 0 && <StatusBadge meaning={FINDING_REVIEW.closed} label={`${closed} closed`} />}
      </div>

      <div className="flex min-h-0 flex-col gap-1.5 border-t border-border pt-3">
        <p className="text-[12px] font-medium text-foreground">Top findings · CVSS</p>
        {data.top.length ? (
          <ol className="dash-top-findings">
            {data.top.map((f) => (
              <li key={f.key} className="dash-top-finding">
                <span className="min-w-0">
                  <span className="block truncate text-xs text-foreground" title={f.title}>
                    {f.title}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{f.run ? `${f.id} · ${f.run}` : f.id}</span>
                </span>
                <SeverityBadge level={f.severity} />
                <span className="w-8 text-right font-mono text-[12px] tabnums text-foreground" title={`CVSS ${f.score.toFixed(1)}`}>
                  {f.score.toFixed(1)}
                </span>
                <ViewLink
                  view="findings"
                  filters={{ finding: f.key }}
                  label={`Open ${f.id}${f.run ? ` (${f.run})` : ""}: ${f.title}`}
                  className="absolute inset-0 rounded-md"
                >
                  <span className="sr-only">{f.id}</span>
                </ViewLink>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">No CVSS-scored findings yet.</p>
        )}
      </div>
    </DashCard>
  );
}
