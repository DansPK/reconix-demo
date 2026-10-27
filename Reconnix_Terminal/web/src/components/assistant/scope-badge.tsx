/* The status of what a conversation is about, as a badge: one run's status (lib/status.ts), or
   for every run what needs the operator most (waiting, running, else how many are saved). */
import { RUN_STATUS, type Meaning } from "@/lib/status";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RunSummary, ScopeRef } from "./types";

// meanings lib/status.ts doesn't have (defined here, reported to its owner)
const SAVED_RUNS: Meaning = { label: "Saved runs", tone: "info", icon: "done", hint: "Every assessment the TUI saved on this computer." };
const NOT_SAVED: Meaning = { label: "Not saved any more", tone: "info", icon: "unreached", hint: "This run's file is gone; the conversation stays readable." };

export function ScopeBadge({ scope, runs }: { scope: ScopeRef; runs: RunSummary[] }) {
  if (scope.uid) {
    const run = runs.find((r) => r.uid === scope.uid);
    return <StatusBadge meaning={run ? RUN_STATUS[run.status] : NOT_SAVED} />;
  }
  const waiting = runs.filter((r) => r.status === "Awaiting input").length;
  const running = runs.filter((r) => r.status === "Running").length;
  if (waiting) return <StatusBadge meaning={RUN_STATUS["Awaiting input"]} label={`${waiting} waiting for you`} />;
  if (running) return <StatusBadge meaning={RUN_STATUS.Running} label={`${running} running`} />;
  return <StatusBadge meaning={SAVED_RUNS} label={`${runs.length} saved ${runs.length === 1 ? "run" : "runs"}`} />;
}
