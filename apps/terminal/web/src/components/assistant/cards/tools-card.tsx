/* Tool results from the saved activity log, per run: the steps by tool (how many each approved
   tool ran), the requests the run sent, then each step with its time and tool. Every number is
   the server's (lib/assistant/cards.ts); the groups only count the rows the card shows. A record
   only: nothing runs from the dashboard. */
import { Wrench } from "lucide-react";
import { toolGroups } from "@/lib/assistant/cards";
import type { CardOf } from "@/lib/assistant/protocol";
import { CardShell, runName } from "./card-shell";

export function ToolsCard({ card }: { card: CardOf<"tools"> }) {
  return (
    <CardShell icon={Wrench} title="Tool results" meta="from the activity log" footer={<span>A record of what ran in the TUI. Nothing runs from here.</span>}>
      {card.runs.length === 0 && <p className="ai-card-empty">No runs to show.</p>}
      {card.runs.map((r) => {
        const groups = toolGroups(r.steps).filter((g) => g.tool !== "—");
        const partial = r.total > r.steps.length;
        return (
          <div key={r.run.uid} className="ai-card-section">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
              <span className="text-foreground">{runName(r.run)}</span>
              <span className="ai-num text-muted-foreground">
                {r.total} tool {r.total === 1 ? "step" : "steps"} · {r.requests} {r.requests === 1 ? "request" : "requests"} sent
              </span>
            </p>
            {groups.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Steps by tool in ${r.run.label}${partial ? " (of the steps shown)" : ""}`}>
                {groups.map((g) => (
                  <li key={g.tool} className="ai-tool-chip">
                    <span className="ai-mono text-primary">{g.tool}</span>
                    <span className="ai-num text-muted-foreground">
                      {g.steps} {g.steps === 1 ? "step" : "steps"}
                    </span>
                  </li>
                ))}
                {partial && <li className="ai-card-sub mt-0 self-center">of the {r.steps.length} shown</li>}
              </ul>
            )}
            {r.steps.length === 0 ? (
              <p className="ai-card-sub">No tool steps in this run&apos;s log.</p>
            ) : (
              <ol className="mt-1.5 space-y-1" aria-label={`Tool steps of ${r.run.label}`}>
                {r.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[12.5px] leading-snug">
                    <span className="ai-num shrink-0 text-muted-foreground">{s.time}</span>
                    <span className="min-w-0 flex-1 text-foreground [overflow-wrap:anywhere]">{s.text}</span>
                    {s.tool !== "—" && <span className="ai-mono hidden shrink-0 text-primary sm:inline">{s.tool}</span>}
                  </li>
                ))}
              </ol>
            )}
            {partial && <p className="ai-card-sub">… and {r.total - r.steps.length} more steps.</p>}
          </div>
        );
      })}
      {card.more > 0 && <p className="ai-card-empty">{card.more} older runs not shown.</p>}
    </CardShell>
  );
}
