/* One run's Activity Timeline (part of deriveDashboard, derive.ts): its log lines in a lane per
   kind, clustered into marks that never touch (axis.ts), each event with a readable time, a
   label, a status badge and its text masked again (lib/assistant/redact.ts). Pure. */
import { redact } from "@/lib/assistant/redact";
import { duration, stamp } from "@/lib/data/format";
import type { AssessmentView, LogLine, Severity } from "@/lib/data/view-types";
import { APPROVAL_STATE, toneColor } from "@/lib/status";

import { cluster, ticksAt } from "./axis";
import { AXIS_TICKS, plural } from "./derive-shared";
import { EVENT_KIND, eventBadge, eventLabel, LANE_ORDER } from "./event-kinds";
import type { ActivityCard, ActivityEvent, ActivityLane } from "./overview-types";

export function activityCard(v: AssessmentView, pos: (sec: number) => number, labelAt: (p: number) => string): ActivityCard {
  const log = v.log;
  const tools = v.scope?.tools ?? [];
  const lastGate = [...log].reverse().find((l) => l.kind === "gate");
  const lastTool = [...log].reverse().find((l) => l.kind === "tool");
  const severityOf = (id: string): Severity | undefined => v.findings.find((f) => f.id === id)?.severity;
  const event = (l: LogLine, i: number): ActivityEvent => {
    const ms = v.startMs + l.sec * 1000;
    return {
      key: String(i),
      time: l.t,
      when: l.t === "—" ? "time not recorded" : stamp(ms),
      kind: l.kind,
      label: redact(eventLabel(l.kind, l.text, tools)),
      badge: eventBadge(l.kind, l.text, {
        who: l.who,
        pendingGate: v.gate !== null && l === lastGate,
        liveTool: v.status === "Running" && l === lastTool,
        severityOf,
      }),
      text: redact(l.text),
    };
  };
  const events = log.map((l, i) => ({ line: l, event: event(l, i) }));
  const lanes: ActivityLane[] = LANE_ORDER.map((kind) => {
    const here = events.filter((e) => e.line.kind === kind);
    const groups = cluster(here.map((e) => ({ pos: pos(e.line.sec), item: e })));
    const meaning = EVENT_KIND[kind];
    return {
      kind,
      label: meaning.label,
      hint: meaning.hint,
      color: toneColor(meaning.tone),
      count: here.length,
      marks: groups.map((g) => {
        const first = g.items[0].event;
        const last = g.items[g.items.length - 1].event;
        const span = g.items.length > 1 && first.time !== last.time ? `${first.time}–${last.time}` : first.time;
        return {
          key: `${kind}-${first.key}`,
          start: g.start,
          end: g.end,
          count: g.items.length,
          pending: g.items.some((e) => e.event.badge.type === "status" && e.event.badge.meaning === APPROVAL_STATE.PENDING),
          title: g.items.length > 1 ? `${span} · ${g.items.length} ${meaning.label.toLowerCase()} events` : `${span} · ${first.label}`,
          events: g.items.map((e) => e.event),
        };
      }),
    };
  });
  const start = labelAt(0);
  const end = labelAt(1);
  const pending = lanes.some((l) => l.marks.some((m) => m.pending));
  return {
    mode: "events",
    lanes,
    ticks: log.length ? ticksAt(AXIS_TICKS, labelAt) : [],
    total: log.length,
    window: log.length ? `${start} → ${end} · ${duration(v.spanSec)}` : "No activity yet",
    summary: `Activity timeline from ${start} to ${end}: ${plural(log.length, "log event")} in ${lanes.filter((l) => l.count).length} kinds.`,
    legend: [
      { label: "One event", color: "var(--muted-foreground)", hint: "A single log line.", shape: "dot" },
      { label: "Events close together", color: "var(--muted-foreground)", hint: "Several lines too close to draw apart; the number counts them.", shape: "count" },
      ...(pending ? [{ label: "Waits on you", color: toneColor(APPROVAL_STATE.PENDING.tone), hint: APPROVAL_STATE.PENDING.hint, shape: "ring" as const }] : []),
    ],
    empty: log.length ? null : "Nothing logged yet: the timeline fills in as the run goes.",
  };
}
