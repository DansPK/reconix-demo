/* A view's summary strip (the Report view's) in the Overview's card style, drawn from the Stat list
   its derive module made (stat-types.ts): the big number, its badges (each a toggletip with what
   it means), an optional meter and note; a card with a drill-down opens it. No data-motion: only
   the Overview takes part in the AI Assistant's transition. */
import { Bug, EyeOff, Layers, ListChecks, Send, type LucideIcon } from "lucide-react";

import { badgeText, EventBadge } from "@/components/dashboard/event-badge";
import { Hint } from "@/components/dashboard/hint";
import type { EventBadge as Badge } from "@/components/dashboard/overview-types";
import { StatCard, StatMeter, StatValue } from "@/components/dashboard/stat-card";
import type { Stat, StatIcon } from "@/components/dashboard/stat-types";
import { ViewLink } from "@/components/dashboard/view-link";
import { SEVERITY_META } from "@/lib/status";

const ICONS: Record<StatIcon, LucideIcon> = {
  findings: Bug,
  steps: ListChecks,
  requests: Send,
  masked: EyeOff,
  runs: Layers,
};

const hintOf = (b: Badge) =>
  b.type === "severity"
    ? { title: `Worst severity: ${SEVERITY_META[b.level].label}`, text: SEVERITY_META[b.level].hint }
    : { title: b.meaning.label, text: b.meaning.hint };

export function StatStrip({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="dash-summary">
      {stats.map((s) => (
        <StatCard key={s.label} label={s.label} icon={ICONS[s.icon]}>
          <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <span className="flex items-baseline gap-1.5">
              <StatValue value={s.value} format={s.format} />
              {s.unit && <span className="text-xs text-muted-foreground">{s.unit}</span>}
            </span>
            {s.badges.length > 0 && (
              <span className="flex flex-wrap justify-end gap-1">
                {s.badges.map((b) => (
                  <Hint key={badgeText(b)} {...hintOf(b)}>
                    <EventBadge badge={b} />
                  </Hint>
                ))}
              </span>
            )}
          </div>
          {s.meter && <StatMeter frac={s.meter.frac} over={s.meter.over} label={s.meter.label} />}
          <p className="dash-stat-note [overflow-wrap:anywhere]">{s.note}</p>
          {s.link && (
            <ViewLink view={s.link.view} filters={s.link.filters} label={s.link.label} className="absolute inset-0 z-[1] rounded-[14px]">
              <span className="sr-only">{s.link.label}</span>
            </ViewLink>
          )}
        </StatCard>
      ))}
    </div>
  );
}
