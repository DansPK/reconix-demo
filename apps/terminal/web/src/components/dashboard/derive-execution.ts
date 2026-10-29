/* One run's Execution Timeline (part of deriveDashboard, derive.ts): a row per plan step, the
   tool steps as segments on one time track (the saved run doesn't say which step a log line
   belongs to), and the gate a waiting run stopped at. Pure. */
import { redact } from "@/lib/assistant/redact";
import type { AssessmentView } from "@/lib/data/view-types";
import { APPROVAL_STATE, RUN_STATUS, STEP_STATUS, toneColor } from "@/lib/status";

import { mergeNarrow, type Segment, segmentLabel, ticksAt } from "./axis";
import { AXIS_TICKS, plural, STEP_LEGEND } from "./derive-shared";
import { EVENT_KIND, toolLabel } from "./event-kinds";
import type { ExecutionCard, ToolSegment } from "./overview-types";

export function executionCard(v: AssessmentView, pos: (sec: number) => number, labelAt: (p: number) => string): ExecutionCard {
  const log = v.log;
  const tools = v.scope?.tools ?? [];
  const nextStop = (afterSec: number) => log.find((l) => (l.kind === "tool" || l.kind === "gate") && l.sec > afterSec)?.sec ?? v.spanSec;
  // tool steps as segments that last until the next tool step or gate; the same tool again
  // right after itself extends its segment
  const segments: Segment[] = [];
  log.forEach((l, i) => {
    if (l.kind !== "tool") return;
    const label = toolLabel(l.text, tools);
    const prev = segments[segments.length - 1];
    const start = pos(l.sec);
    if (prev && prev.tools.length === 1 && prev.tools[0] === label && prev.end >= start) {
      prev.end = pos(nextStop(l.sec));
      prev.steps += 1;
      prev.times.push(l.t);
    } else segments.push({ key: String(i), tools: [label], start, end: pos(nextStop(l.sec)), steps: 1, times: [l.t] });
  });
  const live = v.status === "Running";
  const shown = mergeNarrow(segments);
  const toolSegments: ToolSegment[] = shown.map((s, i) => ({
    key: s.key,
    label: redact(segmentLabel(s.tools)),
    start: s.start,
    end: Math.max(s.end, s.start),
    steps: s.steps,
    title: redact(`${segmentLabel(s.tools)} · ${s.times[0]}${s.steps > 1 ? `–${s.times[s.times.length - 1]} · ${s.steps} steps` : ""}`),
    live: live && i === shown.length - 1,
  }));
  const lastGate = [...log].reverse().find((l) => l.kind === "gate");
  const approval = v.approvals.find((a) => a.state === "PENDING");
  const gate = v.gate
    ? {
        pos: lastGate ? pos(lastGate.sec) : null,
        time: v.gate.time,
        text: redact(v.gate.text),
        meaning: approval ? APPROVAL_STATE.PENDING : RUN_STATUS["Awaiting input"],
      }
    : null;
  const done = v.phases.filter((p) => p.status === "done").length;
  return {
    mode: "phases",
    phases: v.phases,
    tools: toolSegments,
    ticks: log.length ? ticksAt(AXIS_TICKS, labelAt) : [],
    gate,
    caption: v.phases.length ? `${done} of ${plural(v.phases.length, "plan step")} done` : "No plan yet",
    summary: v.phases.length
      ? `Execution: ${v.phases.map((p) => `${p.label} ${STEP_STATUS[p.status].label.toLowerCase()} ${p.pct}%`).join(", ")}; ${plural(toolSegments.length, "tool segment")}.`
      : "Execution: no plan yet.",
    legend: [
      ...STEP_LEGEND.filter((item) => v.phases.some((p) => STEP_STATUS[p.status].label === item.label)),
      { label: "Tool step", color: toneColor(EVENT_KIND.tool.tone), hint: EVENT_KIND.tool.hint, shape: "bar" },
      ...(gate ? [{ label: gate.meaning.label, color: toneColor(gate.meaning.tone), hint: gate.meaning.hint, shape: "diamond" as const }] : []),
    ],
  };
}
