/* The Run log view's data, from one saved run's grouped timeline (AssessmentView.stream,
   lib/data/thinking.ts): the messages as they read in the TUI (a glyph, never a name in front),
   and each thinking block's title, its newest step and its steps as time · who · text. Every
   text is masked again here (lib/assistant/redact.ts) on top of what the TUI's snapshot masked,
   and every label is computed once, on the server. */
import { redact } from "@/lib/assistant/redact";
import { clock, parseTime } from "@/lib/data/format";
import type { TimelineEntry } from "@/lib/data/schema";
import type { LiveState } from "@/lib/data/thinking";
import type { AssessmentView } from "@/lib/data/view-types";

import { plural } from "./derive-shared";

/** A message: who said it only as its glyph (› you, ◆ reconix, ■ a policy banner). */
export interface RunLogMessage {
  type: "message";
  key: string;
  speaker: "you" | "reconix" | "policy" | ""; // "" continues the message above
  text: string;
  tone: string;
  banner: boolean;
}

export interface RunLogStep {
  key: string;
  time: string; // "07:02:39", or "—" when the saved line has no time
  who: string; // ai, tool, policy, system, you
  text: string;
  tone: string;
}

export interface RunLogBlock {
  type: "block";
  key: string;
  state: LiveState;
  title: string; // "Worked for 9s", "Working… 14s", "Waiting for you", "Stopped"
  detail: string; // "7 steps"
  blocked: number;
  latest: string; // the newest step, shown under a folded block that is still going
  steps: RunLogStep[];
}

export type RunLogItem = RunLogMessage | RunLogBlock;

export interface RunLogData {
  tag: string; // the run, beside the title
  caption: string; // "12 messages · 9 blocks of steps"
  items: RunLogItem[];
}

// who did a step, in plain words: a copy of the TUI's widgets/log_rows.py, change both
const SOURCE_NAME: Record<string, string> = { AI: "ai", USER: "you", TOOL: "tool", POLICY: "policy", SYS: "system" };
const SPEAKER_NAME: Record<string, string> = { reconix: "ai", "": "ai", you: "you", policy: "policy" };
const SPEAKERS: readonly string[] = ["you", "reconix", "policy"];

/** "45s", "3m 07s", "1h 02m" (the TUI's duration_text). */
export function secondsText(total: number): string {
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return minutes ? `${minutes}m ${String(total % 60).padStart(2, "0")}s` : `${total % 60}s`;
}

/** A step's text as one line: a card's title and its label/value rows, a ✓ on a checklist line. */
function stepText(e: TimelineEntry): string {
  if (e.kind === "card") return [e.text, ...e.rows.map(([label, value]) => `${label} ${value}`)].join("   ");
  if (e.kind === "check") return `✓ ${e.text}`;
  return e.text;
}

function step(e: TimelineEntry): RunLogStep {
  const ms = parseTime(e.at);
  return {
    key: `s${e.seq}`,
    time: ms === null ? "—" : clock(ms),
    who: (e.type === "activity" ? SOURCE_NAME[e.who] : SPEAKER_NAME[e.who]) ?? "ai",
    text: redact(stepText(e)),
    tone: e.tone,
  };
}

function blockTitle(state: LiveState, verb: "Thought" | "Worked", seconds: number): string {
  if (state === "running") return `${verb === "Thought" ? "Thinking…" : "Working…"} ${secondsText(seconds)}`;
  if (state === "paused") return "Waiting for you";
  if (state === "stopped") return "Stopped";
  return seconds ? `${verb} for ${secondsText(seconds)}` : verb;
}

export function runLogData(v: AssessmentView): RunLogData {
  const items: RunLogItem[] = v.stream.map((item) => {
    if (item.type === "message") {
      const e = item.entry;
      return {
        type: "message",
        key: `m${e.seq}`,
        speaker: SPEAKERS.includes(e.who) ? (e.who as RunLogMessage["speaker"]) : "",
        text: redact(e.text),
        tone: e.tone,
        banner: e.kind === "banner",
      };
    }
    const steps = item.steps.map(step);
    return {
      type: "block",
      key: `t${item.key}`,
      state: item.state,
      title: blockTitle(item.state, item.verb, item.seconds),
      detail: plural(steps.length, "step"),
      blocked: item.blocked,
      latest: steps[steps.length - 1].text,
      steps,
    };
  });
  const messages = items.filter((i) => i.type === "message").length;
  return {
    tag: `${v.id} · ${v.target}`,
    caption: `${plural(messages, "message")} · ${plural(items.length - messages, "block")} of steps`,
    items,
  };
}
