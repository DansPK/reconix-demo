"use client";

/* One run's execution: a row per plan step (name, Planned / Running / Done badge, progress), the
   tool steps as segments on a time track, and the gate the run waits on. The saved run doesn't
   record which step a log line belongs to, so the tool track is shared by every step rather than
   split into the rows. */
import { useId, useRef } from "react";
import { Wrench } from "lucide-react";

import { Axis } from "@/components/dashboard/axis-labels";
import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import { Legend } from "@/components/dashboard/legend";
import type { ExecutionCard } from "@/components/dashboard/overview-types";
import { useMarkNav } from "@/components/dashboard/use-mark-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { STEP_STATUS, toneColor } from "@/lib/status";

type Phases = Extract<ExecutionCard, { mode: "phases" }>;

export function PhaseRows({ data }: { data: Phases }) {
  const hint = useId();
  const group = useRef<HTMLDivElement>(null);
  const keys = [...data.tools.map((s) => s.key), ...(data.gate?.pos != null ? ["gate"] : [])];
  const nav = useMarkNav(keys);
  const { tip, show, hide } = useTip();
  const gate = data.gate;
  const gateTitle = gate ? `${gate.meaning.label} · ${gate.text} · ${gate.time}` : "";

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

      {data.ticks.length > 0 && (
        <div className="dash-chart-scroll">
          <div ref={group} role="group" aria-label={data.summary} aria-describedby={hint} className="dash-track" onKeyDown={nav.onKeyDown}>
            <span className="dash-lane-label" style={{ "--c": toneColor("primary") } as React.CSSProperties}>
              <Wrench className="size-3 shrink-0" aria-hidden /> Tools
            </span>
            <div className="dash-lane-track">
              {data.tools.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  data-mark
                  data-key={s.key}
                  data-row="0"
                  data-pos={(s.start + s.end) / 2}
                  tabIndex={s.key === nav.active ? 0 : -1}
                  aria-label={`Tool: ${s.title}`}
                  className="dash-seg"
                  data-live={s.live ? "" : undefined}
                  style={{ left: `${s.start * 100}%`, width: `max(4px, ${(s.end - s.start) * 100}%)` }}
                  onMouseEnter={(e) => show(e.currentTarget, s.title, [s.live ? "Running now" : s.steps === 1 ? "1 tool step" : `${s.steps} tool steps`])}
                  onMouseLeave={hide}
                  onFocus={(e) => {
                    nav.setCurrent(s.key);
                    show(e.currentTarget, s.title, [s.steps === 1 ? "1 tool step" : `${s.steps} tool steps`]);
                  }}
                  onBlur={hide}
                >
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
              {gate && gate.pos !== null && (
                <button
                  type="button"
                  data-mark
                  data-key="gate"
                  data-row="0"
                  data-pos={gate.pos}
                  tabIndex={nav.active === "gate" ? 0 : -1}
                  aria-label={gateTitle}
                  className="dash-gate-mark"
                  style={{ left: `${gate.pos * 100}%`, "--c": toneColor(gate.meaning.tone) } as React.CSSProperties}
                  onMouseEnter={(e) => show(e.currentTarget, gate.meaning.label, [gate.text, gate.time])}
                  onMouseLeave={hide}
                  onFocus={(e) => {
                    nav.setCurrent("gate");
                    show(e.currentTarget, gate.meaning.label, [gate.text, gate.time]);
                  }}
                  onBlur={hide}
                />
              )}
            </div>
            <Axis ticks={data.ticks} className="dash-lane-axis" />
          </div>
          <p id={hint} className="sr-only">
            Arrow keys move between tool steps.
          </p>
        </div>
      )}

      {gate && (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge meaning={gate.meaning} />
          <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">{gate.text}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{gate.time}</span>
        </p>
      )}
      <Legend items={data.legend} label="Execution Timeline legend" className="mt-auto" />
      <ChartTooltip tip={tip} />
    </>
  );
}
