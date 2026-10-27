/* The Overview's summary strip: Findings, Assessment progress, Tool execution and Duration, for
   one run or every run (derive*.ts). Each card: a label, one big number and its context as badges
   and words, never colour alone; every badge and note with an explanation is a toggletip
   (hint.tsx), reachable by keyboard and touch too. Big numbers carry data-countup for the intro's
   count-up. */
import { Bug, Clock, Gauge, Wrench } from "lucide-react";

import { plural } from "@/components/dashboard/derive-shared";
import type { SummaryStrip as Summary } from "@/components/dashboard/overview-types";
import { Hint } from "@/components/dashboard/hint";
import { StatCard, StatMeter, StatValue } from "@/components/dashboard/stat-card";
import { ViewLink } from "@/components/dashboard/view-link";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { FINDING_REVIEW, RUN_STATUS, SEVERITY_META, STEP_STATUS, TIME_LIMIT } from "@/lib/status";


export function SummaryStrip({ data }: { data: Summary }) {
  const { findings, progress, tools, duration } = data;
  return (
    <div className="dash-summary" data-motion="top">
      <StatCard label="Findings" icon={Bug}>
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <StatValue value={String(findings.total)} />
          {findings.worst && (
            <Hint title={`Worst severity: ${SEVERITY_META[findings.worst.level].label}`} text={SEVERITY_META[findings.worst.level].hint}>
              <SeverityBadge level={findings.worst.level} />
            </Hint>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="dash-stat-note">
            {findings.worst
              ? `${findings.worst.count} ${SEVERITY_META[findings.worst.level].label.toLowerCase()} · worst severity`
              : "No findings yet"}
          </p>
          {findings.needsReview > 0 && (
            <Hint title={`${findings.needsReview} need review`} text={FINDING_REVIEW.review.hint}>
              <StatusBadge meaning={FINDING_REVIEW.review} label={`${findings.needsReview} need review`} />
            </Hint>
          )}
        </div>
        <ViewLink view={findings.link.view} filters={findings.link.filters} label={findings.link.label} className="absolute inset-0 z-[1] rounded-[14px]">
          <span className="sr-only">{findings.link.label}</span>
        </ViewLink>
      </StatCard>

      <StatCard label="Assessment progress" icon={Gauge}>
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <StatValue value={`${progress.pct}%`} format="pct" />
          {progress.status && (
            <Hint title={RUN_STATUS[progress.status].label} text={RUN_STATUS[progress.status].hint}>
              <StatusBadge meaning={RUN_STATUS[progress.status]} />
            </Hint>
          )}
          {progress.other && (
            <Hint title={`${progress.other.count} ${RUN_STATUS[progress.other.status].label.toLowerCase()}`} text={RUN_STATUS[progress.other.status].hint}>
              <StatusBadge meaning={RUN_STATUS[progress.other.status]} label={`${progress.other.count} ${RUN_STATUS[progress.other.status].label.toLowerCase()}`} />
            </Hint>
          )}
        </div>
        <StatMeter frac={progress.pct / 100} label="Assessment progress" />
        <p className="dash-stat-note">{progress.caption}</p>
      </StatCard>

      <StatCard label="Tool execution" icon={Wrench}>
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <span className="flex items-baseline gap-1.5">
            <StatValue value={String(tools.steps)} />
            <span className="text-xs text-muted-foreground">{tools.steps === 1 ? "tool step" : "tool steps"}</span>
          </span>
          {tools.running && (
            <Hint title={STEP_STATUS.active.label} text="A run is executing its tool steps now.">
              <StatusBadge meaning={STEP_STATUS.active} />
            </Hint>
          )}
        </div>
        {tools.tools.length ? (
          <Hint title="Tools used" text={tools.tools.join(", ")} className="dash-stat-note min-w-0 self-stretch truncate">
            {`${plural(tools.tools.length, "tool")} · ${tools.tools.join(", ")}`}
          </Hint>
        ) : (
          <p className="dash-stat-note">No approved tool named yet</p>
        )}
        <Hint title="Requests sent" text="Requests the approved tools sent inside the scope (the run's request count)." className="dash-stat-note self-start">
          {tools.caption}
        </Hint>
      </StatCard>

      <StatCard label="Duration" icon={Clock}>
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <StatValue value={duration.value} format={duration.countup ? "duration" : "none"} />
          {duration.over > 0 && (
            <Hint title={TIME_LIMIT.over.label} text={TIME_LIMIT.over.hint}>
              <StatusBadge meaning={TIME_LIMIT.over} label={duration.over === 1 ? TIME_LIMIT.over.label : `${duration.over} over the limit`} />
            </Hint>
          )}
        </div>
        {duration.meter && (
          <StatMeter frac={duration.meter.frac} over={duration.meter.over} label="Time used of the limit" />
        )}
      </StatCard>
    </div>
  );
}
