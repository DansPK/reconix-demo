/* Small helpers the derive modules share (derive.ts, derive-activity.ts, derive-execution.ts,
   derive-overall.ts, derive-report.ts). Pure. */
import { hourMinute, shortDay } from "@/lib/data/format";
import type { AssessmentView } from "@/lib/data/view-types";
import { type Meaning, STEP_STATUS, toneColor } from "@/lib/status";

import type { EventBadge, LegendItem } from "./overview-types";
import type { RunLink } from "./stat-types";

/** Where a run's time axis puts its ticks. */
export const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Legend entries for the plan step states. */
export const STEP_LEGEND: LegendItem[] = (["done", "active", "pending"] as const).map((s) => ({
  label: STEP_STATUS[s].label,
  color: toneColor(STEP_STATUS[s].tone),
  hint: STEP_STATUS[s].hint,
  shape: "bar",
}));

/** A saved run's name in lists: "RCX-001 · 9 Oct 15:33". */
export const runLabel = (v: Pick<AssessmentView, "id" | "createdMs">) => `${v.id} · ${shortDay(v.createdMs)} ${hourMinute(v.createdMs)}`;

export const runLink = (v: Pick<AssessmentView, "uid" | "id" | "createdMs">): RunLink => ({ uid: v.uid, label: runLabel(v) });

/** A status badge in its own words ("2 waiting"), keeping the meaning's colour, icon and hint. */
export const statusBadge = (meaning: Meaning, label = meaning.label): EventBadge => ({ type: "status", meaning: { ...meaning, label } });
