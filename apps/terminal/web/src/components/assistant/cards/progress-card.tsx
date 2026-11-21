/* Plan progress from the saved data: one run's phases with their states, or each run's status
   and progress. Only the states the data records (Planned, Running, Done): no "failed". */
import { ListChecks } from "lucide-react";
import { RUN_STATUS, STEP_STATUS } from "@/lib/status";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CardOf } from "@/lib/assistant/protocol";
import { Bar, CardShell, runName } from "./card-shell";

export function ProgressCard({ card }: { card: CardOf<"progress"> }) {
  if (card.runs.length === 1) {
    const r = card.runs[0];
    const done = r.phases.filter((p) => p.status === "done").length;
    return (
      <CardShell icon={ListChecks} title="Assessment progress" meta={runName(r.run)}>
        <div className="ai-card-section">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meaning={RUN_STATUS[r.status]} />
            <span className="ai-num text-[13px] text-foreground">{r.progress}%</span>
            <span className="text-[12px] text-muted-foreground">
              · {done} of {r.phases.length} {r.phases.length === 1 ? "step" : "steps"} done
            </span>
          </div>
          <div className="mt-2.5">
            <Bar pct={r.progress} tone={r.progress === 100 ? "success" : undefined} label={`${r.run.label} progress`} />
          </div>
        </div>
        {r.phases.length > 0 ? (
          <ol aria-label="Plan phases">
            {r.phases.map((p, i) => (
              <li key={`${p.label}-${i}`} className="ai-card-row is-center">
                <span className="ai-num w-5 shrink-0 text-[12px] text-muted-foreground">{i + 1}</span>
                <span className="ai-card-line min-w-0 flex-1">{p.label}</span>
                <span className="ai-num hidden w-10 text-right text-[12px] text-muted-foreground sm:inline">{p.pct}%</span>
                <StatusBadge meaning={STEP_STATUS[p.status]} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="ai-card-empty">No plan saved yet.</p>
        )}
      </CardShell>
    );
  }
  const completed = card.runs.filter((r) => r.status === "Completed").length;
  return (
    <CardShell
      icon={ListChecks}
      title="Assessment progress"
      meta={`${completed} of ${card.runs.length + card.more} completed${card.more ? ` (newest ${card.runs.length} shown)` : ""}`}
    >
      <ul aria-label="Runs">
        {card.runs.map((r) => {
          const done = r.phases.filter((p) => p.status === "done").length;
          return (
            <li key={r.run.uid} className="ai-card-row is-center">
              <div className="ai-card-row-main">
                <p className="ai-card-line">{runName(r.run)}</p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="max-w-[220px] flex-1">
                    <Bar pct={r.progress} tone={r.progress === 100 ? "success" : undefined} label={`${r.run.label} progress`} />
                  </div>
                  <span className="ai-num text-[12px] text-muted-foreground">
                    {r.progress}% · {done}/{r.phases.length} steps
                  </span>
                </div>
              </div>
              <StatusBadge meaning={RUN_STATUS[r.status]} />
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
