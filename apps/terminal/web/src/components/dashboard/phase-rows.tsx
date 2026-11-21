/* One run's execution: a row per plan step (name, Planned / Running / Done badge, progress), the
   tool steps as segments on a time track (PhaseTrack client leaf), and the gate the run waits on.
   Server component: static plan steps, gate summary and legend render on the server. */
import { Legend } from "@/components/dashboard/legend";
import type { ExecutionCard } from "@/components/dashboard/overview-types";
import { PhaseTrack } from "@/components/dashboard/phase-track";
import { StatusBadge } from "@/components/ui/status-badge";
import { STEP_STATUS, toneColor } from "@/lib/status";

type Phases = Extract<ExecutionCard, { mode: "phases" }>;

export function PhaseRows({ data }: { data: Phases }) {
  const gate = data.gate;

  return (
    <>
      {data.phases.length ? (
        <ol aria-label="Plan steps" className="dash-phases">
          {data.phases.map((p) => {
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
        <p className="text-xs text-muted-foreground">No plan yet: the TUI builds one after the scope is approved.</p>
      )}

      {data.ticks.length > 0 && <PhaseTrack data={data} />}

      {/* two rows at most, whatever the text measures: the badge and its time, then the gate on one
          line (all of it in the tooltip), so a longer name never pushes the Overview out of its
          fixed frame */}
      {gate && (
        <div className="grid gap-1 text-xs">
          <p className="flex items-center gap-2">
            <StatusBadge meaning={gate.meaning} />
            <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{gate.time}</span>
          </p>
          <p className="min-w-0 truncate text-foreground" title={gate.text}>
            {gate.text}
          </p>
        </div>
      )}
      <Legend items={data.legend} label="Execution Timeline legend" className="mt-auto" />
    </>
  );
}
