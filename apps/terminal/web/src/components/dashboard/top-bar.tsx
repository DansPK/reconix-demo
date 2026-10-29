/* The top bar: the live-refresh pill, the Assessment switcher (every width), the Target /
   Template / Status chips (wide screens; for the open run, or counts across every run) and docs
   search. A server component: each client piece gets
   only the fields it shows (never the whole Dashboard or Overall, which would put every saved
   value into the page). */
import { AssessmentSwitcher } from "@/components/dashboard/assessment-switcher";
import type { Dashboard } from "@/components/dashboard/derive";
import type { Overall } from "@/components/dashboard/derive-overall";
import { DocsSearch } from "@/components/dashboard/docs-search";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { OverallChips, type OverallChipsData } from "@/components/dashboard/overall-chips";
import { RunChips, type RunChipsData } from "@/components/dashboard/run-chips";
import type { LibraryItem, SkippedFile } from "@/lib/data/view-types";
import { liveRefreshMs } from "@/lib/live-refresh";

const runChips = (d: Dashboard): RunChipsData => ({
  assessment: { target: d.assessment.target, template: d.assessment.template, status: d.assessment.status, progress: d.assessment.progress },
  scope: d.scope ? { include: d.scope.include, exclude: d.scope.exclude } : null,
  phases: d.phases,
  requests: d.requests,
  minutes: d.minutes,
});

const overallChips = (o: Overall): OverallChipsData => ({
  runs: o.runs,
  completed: o.completed,
  waiting: o.waiting,
  targets: o.targets,
  templates: o.templates,
  statuses: o.statuses,
});

export function TopBar({
  dash,
  overall,
  items,
  dir,
  renderedAt,
  skipped,
}: {
  dash: Dashboard | null; // the open run, if one is open
  overall: Overall | null; // every saved run, when none is open
  items: LibraryItem[];
  dir: string;
  renderedAt: string;
  skipped: SkippedFile[];
}) {
  const a = dash?.assessment ?? null;
  return (
    <header className="dash-topbar relative z-30 flex min-w-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
      <LiveRefresh renderedAt={renderedAt} dir={dir} everyMs={liveRefreshMs()} />
      {(dash || overall) && (
        <div className="dash-reveal flex min-w-0 items-center gap-2 xl:ml-auto">
          <AssessmentSwitcher current={a && { uid: a.uid, id: a.id, name: a.name }} items={items} skipped={skipped} />
          {/* the chips need ≥1280 px; the Template chip ≥1440 (run-chips / overall-chips) */}
          <div className="hidden min-w-0 items-center gap-2 xl:flex">
            {dash ? <RunChips dash={runChips(dash)} /> : overall && <OverallChips overall={overallChips(overall)} />}
          </div>
        </div>
      )}

      <div className="dash-reveal ml-auto flex shrink-0 items-center gap-2 xl:ml-3">
        <DocsSearch />
      </div>
    </header>
  );
}
