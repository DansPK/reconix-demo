"use client";

/* With every run shown: the runs started per day (or week) as bars stacked by run status, with
   a count axis and a day axis. Hover or focus a bar for its tooltip; click it (or Enter) to list
   that day's runs, each opening its own Overview. */
import { useId, useRef, useState } from "react";
import Link from "next/link";

import { Axis } from "@/components/dashboard/axis-labels";
import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import { Legend } from "@/components/dashboard/legend";
import { MarkDetails, closeTo } from "@/components/dashboard/mark-details";
import type { ActivityCard, DayBar, RunEntry } from "@/components/dashboard/overview-types";
import { useMarkNav } from "@/components/dashboard/use-mark-nav";
import { useRunHref } from "@/components/dashboard/view-url";
import { StatusBadge } from "@/components/ui/status-badge";
import { RUN_STATUS } from "@/lib/status";

type Days = Extract<ActivityCard, { mode: "days" }>;

const preview = (d: DayBar) => [...d.runs.slice(0, 3).map((r) => `${r.time} · ${r.id} · ${RUN_STATUS[r.status].label}`), ...(d.runs.length > 3 ? [`+${d.runs.length - 3} more · click for all`] : ["Click for the runs"])];

function RunItem({ run, href }: { run: RunEntry; href: string }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link href={href} className="flex flex-col gap-1 rounded-md px-1 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex flex-wrap items-center gap-2">
          <time className="font-mono text-[11px] text-foreground">{run.time}</time>
          <span className="text-xs text-foreground">
            {run.id} · {run.template}
          </span>
          <StatusBadge meaning={RUN_STATUS[run.status]} />
        </span>
        <span className="font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
          {run.target} · {run.progress}% · {run.findings === 1 ? "1 finding" : `${run.findings} findings`}
          {run.waiting && ` · ${run.waiting}`}
        </span>
      </Link>
    </li>
  );
}

export function RunsPerDay({ data }: { data: Days }) {
  const hint = useId();
  const group = useRef<HTMLDivElement>(null);
  const href = useRunHref();
  const bars = data.days.filter((d) => d.total > 0);
  const nav = useMarkNav(bars.map((d) => d.key));
  const { tip, show, hide } = useTip();
  const [open, setOpen] = useState<string | null>(null);
  const opened = bars.find((d) => d.key === open) ?? null;
  const close = () => {
    if (open) closeTo(group.current, open);
    setOpen(null);
  };

  return (
    <>
      <div className="dash-chart-scroll">
        <div ref={group} role="group" aria-label={data.summary} aria-describedby={hint} className="dash-days" onKeyDown={nav.onKeyDown}>
          <div aria-hidden className="dash-yaxis">
            {data.yTicks.map((v) => (
              <span key={v} style={{ bottom: `${(v / data.max) * 100}%` }}>
                {v}
              </span>
            ))}
          </div>
          <div className="dash-days-plot">
            {data.yTicks.map((v) => (
              <span key={v} aria-hidden className="dash-gridline" style={{ bottom: `${(v / data.max) * 100}%` }} />
            ))}
            {bars.map((d) => (
              <button
                key={d.key}
                type="button"
                data-mark
                data-key={d.key}
                data-row="0"
                data-pos={d.pos}
                tabIndex={d.key === nav.active ? 0 : -1}
                aria-label={d.title}
                aria-haspopup="dialog"
                className="dash-daybar"
                style={{ left: `${(d.pos - d.width / 2) * 100}%`, width: `${d.width * 100}%` }}
                onMouseEnter={(e) => show(e.currentTarget, d.title, preview(d))}
                onMouseLeave={hide}
                onFocus={(e) => {
                  nav.setCurrent(d.key);
                  show(e.currentTarget, d.title, preview(d));
                }}
                onBlur={hide}
                onClick={() => {
                  hide();
                  setOpen(d.key);
                }}
              >
                <span className="dash-daybar-stack" data-bar style={{ height: `${(d.total / data.max) * 100}%` }}>
                  {d.segments.map((s) => (
                    <span key={s.status} data-pattern={s.pattern === "stripes" ? "stripes" : undefined} style={{ flexGrow: s.count, backgroundColor: s.color }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <Axis ticks={data.ticks} className="dash-days-axis" />
        </div>
      </div>
      <p id={hint} className="sr-only">
        Arrow keys move between days; Enter lists that day&apos;s runs.
      </p>
      <Legend items={data.legend} label="Activity Timeline legend: run status" className="mt-auto" />
      <ChartTooltip tip={tip} />
      {opened && (
        <MarkDetails title={`${opened.label} · ${opened.total === 1 ? "1 run" : `${opened.total} runs`}`} subtitle={opened.title} onClose={close}>
          <ol>
            {opened.runs.map((r) => (
              <RunItem key={r.uid} run={r} href={href(r.uid)} />
            ))}
          </ol>
        </MarkDetails>
      )}
    </>
  );
}
