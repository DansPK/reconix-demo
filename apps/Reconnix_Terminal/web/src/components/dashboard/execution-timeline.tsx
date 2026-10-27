/* The Execution Timeline panel: one run's plan steps as labelled rows with their status and
   progress, its tool steps on a time track and the gate it waits on (PhaseRows), or with every
   run shown, the newest runs as rows (RunRows). */
import { DashCard } from "@/components/dashboard/dash-card";
import type { ExecutionCard } from "@/components/dashboard/overview-types";
import { PhaseRows } from "@/components/dashboard/phase-rows";
import { RunRows } from "@/components/dashboard/run-rows";
import { DOCS } from "@/lib/docs-nav";

export function ExecutionTimeline({ data }: { data: ExecutionCard }) {
  return (
    <DashCard
      id="execution-timeline"
      title="Execution Timeline"
      docsHref={DOCS.assessmentGuide}
      meta={data.caption}
      className="dash-panel"
      bodyClassName="flex flex-col gap-2.5"
    >
      {data.mode === "phases" ? <PhaseRows data={data} /> : <RunRows data={data} />}
    </DashCard>
  );
}
