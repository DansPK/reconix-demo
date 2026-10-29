"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WORKFLOW_STEPS, type PreviewLine, type Tone, type WorkflowStep } from "@/components/workflow-data";
import { cn } from "@/lib/utils";

const DEFAULT_STEP = WORKFLOW_STEPS.findIndex((s) => s.gate);

const toneText: Record<Tone, string> = {
  muted: "text-muted-foreground",
  foreground: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  accent: "text-accent",
};

/**
 * Horizontal, interactive assessment workflow: an ARIA tablist rail of steps joined by
 * connectors, and one detail panel per step stacked in a single grid cell (the cell is as
 * tall as the tallest panel, so switching never shifts the layout; panels swap through
 * `.wipe[data-state]`). Hover/focus previews a step, click/Enter/arrows select it.
 * Below lg the rail scrolls sideways with scroll-snap. Connector + card styling: `.wf-*` in globals.css.
 */
export function WorkflowStepper() {
  const [selected, setSelected] = useState(DEFAULT_STEP);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? selected;
  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  /** keep the chosen tab in view inside the (mobile) scrolling rail without moving the page */
  const reveal = (i: number) => {
    const rail = railRef.current;
    const tab = tabRefs.current[i];
    if (!rail || !tab || rail.scrollWidth <= rail.clientWidth) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const offset = tab.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollTo({
      left: rail.scrollLeft + offset - (rail.clientWidth - tab.offsetWidth) / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const select = (i: number, focus = false) => {
    setSelected(i);
    setHovered(null);
    if (focus) tabRefs.current[i]?.focus({ preventScroll: true });
    reveal(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = WORKFLOW_STEPS.length - 1;
    const next = { ArrowRight: Math.min(i + 1, last), ArrowLeft: Math.max(i - 1, 0), Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <div className="space-y-6">
      <div
        ref={railRef}
        data-reveal
        className="wf-rail -mx-4 snap-x overflow-x-auto px-4 py-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0"
        onMouseLeave={() => setHovered(null)}
      >
        <div role="tablist" aria-label="Assessment workflow steps" className="flex w-max items-center lg:w-full">
          {WORKFLOW_STEPS.map((step, i) => {
            const state = i === active ? "active" : i < active ? "done" : "todo";
            const Icon = step.icon;
            return (
              <Fragment key={step.id}>
                <button
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${step.id}`}
                  aria-selected={i === selected}
                  aria-controls={`${uid}-panel-${step.id}`}
                  tabIndex={i === selected ? 0 : -1}
                  data-state={state}
                  data-gate={step.gate || undefined}
                  onClick={() => select(i)}
                  onMouseEnter={() => setHovered(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="wf-step group flex w-32 shrink-0 snap-center flex-col gap-3 rounded-xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-auto lg:min-w-0 lg:flex-1"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="wf-num grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold">
                      {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : i + 1}
                    </span>
                    <Icon className="wf-icon size-5" strokeWidth={1.6} aria-hidden />
                  </span>
                  <span className="wf-label truncate font-mono text-xs font-semibold uppercase tracking-[0.14em]">
                    {step.label}
                  </span>
                </button>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="wf-link"
                    data-state={i < active ? "done" : i === active ? "active" : "todo"}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* the card chrome lives on this wrapper: stacked panels must stay transparent or
          the later (hidden) ones would paint over the active one */}
      <div
        data-reveal
        className={cn(
          "grid rounded-2xl border bg-card/80 backdrop-blur-sm transition-colors duration-300",
          WORKFLOW_STEPS[active].gate ? "border-accent/40" : "border-border"
        )}
      >
        {WORKFLOW_STEPS.map((step, i) => (
          <StepPanel
            key={step.id}
            step={step}
            index={i}
            shown={i === active}
            id={`${uid}-panel-${step.id}`}
            labelledBy={`${uid}-tab-${step.id}`}
          />
        ))}
      </div>
    </div>
  );
}

function StepPanel({
  step,
  index,
  shown,
  id,
  labelledBy,
}: {
  step: WorkflowStep;
  index: number;
  shown: boolean;
  id: string;
  labelledBy: string;
}) {
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={labelledBy}
      aria-hidden={!shown}
      inert={!shown}
      data-state={shown ? "in" : "out"}
      className="wipe grid gap-6 p-6 [grid-area:1/1] sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10"
    >
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Step {index + 1} of {WORKFLOW_STEPS.length}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-semibold tracking-tight">{step.title}</h3>
          {step.gate && <Badge variant="accent">human approval</Badge>}
        </div>
        <p className="text-base leading-relaxed text-foreground/90">{step.body}</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {step.detail.map((d) => (
            <li key={d} className="flex gap-2.5">
              <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", step.gate ? "bg-accent" : "bg-primary")} />
              {d}
            </li>
          ))}
        </ul>
        {step.note && (
          <p className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
            {step.note}
          </p>
        )}
      </div>
      <Preview title={step.preview.title} lines={step.preview.lines} gate={step.gate} />
    </div>
  );
}

/** Terminal-style mock of the step's UI. Decorative: the panel text already says what it shows. */
function Preview({ title, lines, gate }: { title: string; lines: PreviewLine[]; gate?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "self-start overflow-hidden rounded-xl border bg-background/80 font-mono text-xs",
        gate ? "border-accent/30" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-muted-foreground">
        <span className="flex gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className={cn("size-2 rounded-full", gate ? "bg-accent/80" : "bg-primary/80")} />
        </span>
        <span className="ml-1 truncate tracking-[0.08em]">{title}</span>
      </div>
      <div className="space-y-2.5 px-4 py-4">
        {lines.map((l, i) =>
          l.chips ? (
            <div key={i} className="flex flex-wrap gap-2">
              {l.chips.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    "rounded-md border px-2.5 py-1",
                    c.active
                      ? gate
                        ? "border-accent/50 bg-accent/10 text-accent"
                        : "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {gate ? `[${c.label}]` : c.label}
                </span>
              ))}
            </div>
          ) : (
            <div key={i} className="flex items-baseline justify-between gap-4">
              <span className={cn("min-w-0 truncate whitespace-pre", toneText[l.tone ?? "foreground"])}>{l.text}</span>
              {l.status && (
                <span className={cn("shrink-0 uppercase tracking-[0.12em]", toneText[l.status.tone])}>{l.status.label}</span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
