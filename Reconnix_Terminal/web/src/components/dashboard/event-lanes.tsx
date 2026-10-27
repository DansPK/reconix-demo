"use client";

/* One run's activity log as labelled lanes (Scope, Policy, Tool, Finding, Approval gate,
   Operator, Info, Mask) on a time axis. Events too close to draw apart are one count pill that
   starts at the first of them (derive.ts clusters them; axis.ts holds the geometry, passed to
   the CSS here). Hover or focus a mark for its tooltip; click it (or Enter) to expand its
   events: time, label, status and the masked text. */
import { useId, useRef, useState } from "react";

import { DOT_PX, PILL_PX, PLOT_MIN_PX } from "@/components/dashboard/axis";
import { Axis } from "@/components/dashboard/axis-labels";
import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import { EventBadge, badgeText } from "@/components/dashboard/event-badge";
import { KIND_ICON } from "@/components/dashboard/event-icons";
import { Legend } from "@/components/dashboard/legend";
import { MarkDetails, closeTo } from "@/components/dashboard/mark-details";
import type { ActivityCard, ActivityEvent, ActivityMark } from "@/components/dashboard/overview-types";
import { useMarkNav } from "@/components/dashboard/use-mark-nav";

type Events = Extract<ActivityCard, { mode: "events" }>;

const GEOMETRY = { "--plot-min": `${PLOT_MIN_PX}px`, "--dot": `${DOT_PX}px`, "--pill": `${PILL_PX}px` };

function preview(m: ActivityMark): string[] {
  const first = m.events.slice(0, 2).map((e) => `${badgeText(e.badge)} · ${e.text}`);
  return [...first, ...(m.count > 2 ? [`+${m.count - 2} more · click for all`] : ["Click for details"])];
}

function EventEntry({ e }: { e: ActivityEvent }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <li className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <time className="font-mono text-[11px] text-foreground">{e.when}</time>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Icon className="size-3" aria-hidden /> {e.label}
        </span>
        <EventBadge badge={e.badge} />
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{e.text}</p>
    </li>
  );
}

export function EventLanes({ data }: { data: Events }) {
  const hint = useId();
  const group = useRef<HTMLDivElement>(null);
  const marks = data.lanes.flatMap((l) => l.marks);
  const nav = useMarkNav(marks.map((m) => m.key));
  const { tip, show, hide } = useTip();
  const [open, setOpen] = useState<string | null>(null);
  const opened = marks.find((m) => m.key === open) ?? null;
  const lane = opened ? data.lanes.find((l) => l.marks.includes(opened)) : null;
  const close = () => {
    if (open) closeTo(group.current, open);
    setOpen(null);
  };

  return (
    <>
      <div className="dash-chart-scroll">
        <div
          ref={group}
          role="group"
          aria-label={data.summary}
          aria-describedby={hint}
          className="dash-lanes"
          style={{ ...GEOMETRY, "--lanes": data.lanes.length } as React.CSSProperties}
          onKeyDown={nav.onKeyDown}
        >
          {data.lanes.map((l, row) => {
            const Icon = KIND_ICON[l.kind];
            return (
              <div key={l.kind} className="dash-lane" style={{ "--c": l.color } as React.CSSProperties}>
                <span className="dash-lane-label" title={l.hint}>
                  <Icon className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{l.label}</span>
                  <span className="ml-auto pl-1 font-mono tabnums text-muted-foreground">{l.count}</span>
                </span>
                <div className="dash-lane-track">
                  {l.marks.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      data-mark
                      data-key={m.key}
                      data-row={row}
                      data-pos={m.start}
                      data-count={m.count > 1 ? "" : undefined}
                      data-pending={m.pending ? "" : undefined}
                      tabIndex={m.key === nav.active ? 0 : -1}
                      aria-label={`${l.label}: ${m.title}`}
                      aria-haspopup="dialog"
                      className="dash-mark"
                      style={{ left: `${m.start * 100}%` }}
                      onMouseEnter={(e) => show(e.currentTarget, m.title, preview(m))}
                      onMouseLeave={hide}
                      onFocus={(e) => {
                        nav.setCurrent(m.key);
                        show(e.currentTarget, m.title, preview(m));
                      }}
                      onBlur={hide}
                      onClick={() => {
                        hide();
                        setOpen(m.key);
                      }}
                    >
                      {m.count > 99 ? "99+" : m.count > 1 ? m.count : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <Axis ticks={data.ticks} className="dash-lane-axis" />
        </div>
      </div>
      <p id={hint} className="sr-only">
        Arrow keys move between events; Enter opens their details.
      </p>
      {data.empty && <p className="text-xs text-muted-foreground">{data.empty}</p>}
      <Legend items={data.legend} label="Activity Timeline legend" className="mt-auto" />
      <ChartTooltip tip={tip} />
      {opened && lane && (
        <MarkDetails title={`${lane.label} · ${opened.count === 1 ? "1 event" : `${opened.count} events`}`} subtitle={opened.title} onClose={close}>
          <ol>
            {opened.events.map((e) => (
              <EventEntry key={e.key} e={e} />
            ))}
          </ol>
        </MarkDetails>
      )}
    </>
  );
}
