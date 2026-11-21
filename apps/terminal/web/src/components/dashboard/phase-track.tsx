"use client";

/* The interactive tool-step track for one run's Execution Timeline: keyboard arrow navigation
   and hover/focus tooltips for tool segments and the approval gate mark. */
import { useId, useRef } from "react";
import { Wrench } from "lucide-react";

import { Axis } from "@/components/dashboard/axis-labels";
import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import type { ExecutionCard } from "@/components/dashboard/overview-types";
import { useMarkNav } from "@/components/dashboard/use-mark-nav";
import { toneColor } from "@/lib/status";

type Phases = Extract<ExecutionCard, { mode: "phases" }>;

export function PhaseTrack({ data }: { data: Phases }) {
  const hint = useId();
  const group = useRef<HTMLDivElement>(null);
  const keys = [...data.tools.map((s) => s.key), ...(data.gate?.pos != null ? ["gate"] : [])];
  const nav = useMarkNav(keys);
  const { tip, show, hide } = useTip();
  const gate = data.gate;
  const gateTitle = gate ? `${gate.meaning.label} · ${gate.text} · ${gate.time}` : "";

  return (
    <>
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
                  show(e.currentTarget, s.title, [s.live ? "Running now" : s.steps === 1 ? "1 tool step" : `${s.steps} tool steps`]);
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
      <ChartTooltip tip={tip} />
    </>
  );
}
