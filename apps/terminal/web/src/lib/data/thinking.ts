/* A saved run's timeline read the way Claude shows a conversation: messages stay, the work between
   them folds into thinking blocks. A port of the TUI's `reconix/store/thinking.py`: change both;
   tests/thinking-vectors.json checks both.

   A message is a chat line or banner (what you typed, what Reconix tells you). Everything else
   (activity rows, result cards, checklist lines, the model's reasoning) is a step, and the steps
   between two messages form one block. Pure: no I/O, no clock (the caller passes `nowMs`). */
import { parseTime } from "./format";
import type { Status, TimelineEntry } from "./schema";

/** Where the run stands; it only decides how a block at the very end reads. */
export type LiveState = "running" | "paused" | "stopped" | "done";

export type StreamItem =
  | { type: "message"; entry: TimelineEntry }
  | {
      type: "block";
      key: number; // the first step's seq: it stays the same while the block grows
      steps: TimelineEntry[];
      state: LiveState;
      verb: "Thought" | "Worked"; // "Thought" when no tool ran
      seconds: number;
      blocked: number; // steps the policy blocked (tone "block")
    };

const MESSAGE_KINDS: readonly string[] = ["text", "banner"];

export const isMessage = (e: TimelineEntry): boolean => e.type === "chat" && MESSAGE_KINDS.includes(e.kind);

/** How a saved run's status reads for its last block. */
export function liveStateOf(status: Status): LiveState {
  if (status === "Running") return "running";
  if (status === "Awaiting input") return "paused";
  if (status === "Stopped" || status === "Interrupted") return "stopped";
  return "done";
}

function seconds(from: string | null, toMs: number | null): number {
  const start = parseTime(from);
  return start === null || toMs === null ? 0 : Math.max(0, Math.floor((toMs - start) / 1000));
}

function block(steps: TimelineEntry[], state: LiveState, endMs: number | null): StreamItem {
  return {
    type: "block",
    key: steps[0].seq,
    steps,
    state,
    verb: steps.some((s) => s.type === "activity" && s.who === "TOOL") ? "Worked" : "Thought",
    seconds: seconds(steps[0].at, endMs),
    blocked: steps.filter((s) => s.tone === "block").length,
  };
}

/** Messages, with each run of steps between them folded into a block. A running block counts
    its time up to `nowMs`; any other block ends at its next message (or its own last step). */
export function groupTimeline(entries: readonly TimelineEntry[], live: LiveState = "done", nowMs: number | null = null): StreamItem[] {
  const items: StreamItem[] = [];
  let steps: TimelineEntry[] = [];
  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (!isMessage(entry)) {
      steps.push(entry);
      continue;
    }
    if (steps.length) items.push(block(steps, "done", parseTime(entry.at)));
    steps = [];
    items.push({ type: "message", entry });
  }
  if (steps.length) {
    const end = live === "running" ? nowMs : parseTime(steps[steps.length - 1].at);
    items.push(block(steps, live, end));
  }
  return items;
}
