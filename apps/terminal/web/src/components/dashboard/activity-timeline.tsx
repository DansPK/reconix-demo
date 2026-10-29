/* The Activity Timeline panel: one run's log in labelled lanes by kind (EventLanes), or with
   every run shown, the runs started per day (RunsPerDay). Both have a time axis, a legend,
   tooltips and marks that expand to their details. */
import { DashCard } from "@/components/dashboard/dash-card";
import { EventLanes } from "@/components/dashboard/event-lanes";
import type { ActivityCard } from "@/components/dashboard/overview-types";
import { RunsPerDay } from "@/components/dashboard/runs-per-day";
import { DOCS } from "@/lib/docs-nav";

export function ActivityTimeline({ data }: { data: ActivityCard }) {
  return (
    <DashCard
      id="activity-timeline"
      title="Activity Timeline"
      docsHref={DOCS.assessmentGuide}
      meta={data.window}
      className="dash-panel"
      bodyClassName="flex flex-col gap-2"
    >
      {data.mode === "events" ? <EventLanes data={data} /> : <RunsPerDay data={data} />}
    </DashCard>
  );
}
