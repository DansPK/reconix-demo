/* Placing things on a time axis without overlap, for the Overview's timelines. Positions are
   fractions of the axis (0 = its left edge, 1 = its right edge). Pure; tested in
   tests/dashboard.test.ts. */

// --- the lanes' geometry: one source for the clustering and the CSS (event-lanes.tsx sets
// these as CSS variables) ---------------------------------------------------------------

/** The narrowest a lane's plot gets; a narrower chart scrolls sideways inside its card. */
export const PLOT_MIN_PX = 296;
/** A single event: a dot centred on its time. */
export const DOT_PX = 10;
/** Events close together: one count pill, starting at the first event's time. */
export const PILL_PX = 18;
/** The least space between two marks. */
export const MARK_MARGIN_PX = 2;

/** One mark holds the events within this much of the axis from its first event; the next event
    starts the next mark. So two marks start more than CLUSTER_GAP × PLOT_MIN_PX (25 px) apart,
    which is at least a pill, half a dot and the margin: no two marks touch at the narrowest
    plot (tests/dashboard.test.ts checks the sum). A dense log still gets one mark per window
    (up to 1 / CLUSTER_GAP per lane), never one pill for everything. */
export const CLUSTER_GAP = 0.085;

/** The most tool segments one track shows; beyond it the narrowest neighbours merge. */
export const MAX_SEGMENTS = 24;

export type Marker = { pos: number; label: string };

export interface Cluster<T> {
  start: number; // the first item's position (where its mark is drawn)
  end: number; // the last item's position (≤ start + gap)
  items: T[];
}

/** Items grouped into windows: an item joins the current group while it is at most `gap` after
    that group's first item, else it starts a new group. Groups therefore start more than `gap`
    apart and span at most `gap` each. */
export function cluster<T>(items: { pos: number; item: T }[], gap = CLUSTER_GAP): Cluster<T>[] {
  const out: Cluster<T>[] = [];
  for (const { pos, item } of [...items].sort((a, b) => a.pos - b.pos)) {
    const last = out[out.length - 1];
    if (last && pos - last.start <= gap) {
      last.end = pos;
      last.items.push(item);
    } else out.push({ start: pos, end: pos, items: [item] });
  }
  return out;
}

/** Labelled ticks at `positions`, dropping a label that repeats the one before it. */
export function ticksAt(positions: number[], labelAt: (pos: number) => string): Marker[] {
  const ticks = positions.map((pos) => ({ pos, label: labelAt(pos) }));
  return ticks.filter((t, i) => i === 0 || t.label !== ticks[i - 1].label);
}

/** Round ticks for a count axis that reaches at least `max`: about three steps of 1, 2, 5, 10,
    20, 25, 50… (`top` is the axis's end, the last tick). */
export function countTicks(max: number): { ticks: number[]; top: number } {
  const want = Math.max(1, max) / 3;
  const power = 10 ** Math.floor(Math.log10(want));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= want && Number.isInteger(s)) ?? 10 * power);
  const top = Math.max(step, Math.ceil(Math.max(1, max) / step) * step);
  return { ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step), top };
}

export interface Segment {
  key: string;
  tools: string[]; // the tools (or step names) it covers, in order
  start: number;
  end: number;
  steps: number; // tool log lines it stands for
  times: string[]; // their clock times
}

/** A segment's name: "Semgrep", "Semgrep + gitleaks", "Semgrep + 3 more". */
export const segmentLabel = (tools: string[]) => (tools.length > 2 ? `${tools[0]} + ${tools.length - 1} more` : tools.join(" + "));

/** At most `max` segments: the narrowest pair of neighbours merges until it fits (a long run
    still shows its whole shape, and nothing overlaps). */
export function mergeNarrow(segments: Segment[], max = MAX_SEGMENTS): Segment[] {
  const out = segments.map((s) => ({ ...s, tools: [...s.tools], times: [...s.times] }));
  while (out.length > max) {
    let at = 0;
    let best = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const width = out[i + 1].end - out[i].start;
      if (width < best) {
        best = width;
        at = i;
      }
    }
    const [a, b] = [out[at], out[at + 1]];
    out.splice(at, 2, {
      key: a.key,
      tools: [...new Set([...a.tools, ...b.tools])],
      start: a.start,
      end: Math.max(a.end, b.end),
      steps: a.steps + b.steps,
      times: [...a.times, ...b.times],
    });
  }
  return out;
}
