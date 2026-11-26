/* The Run log groups a saved timeline with a port of the TUI's `group_stream`
   (reconix/store/thinking.py); both test suites check the same cases (thinking-vectors.json),
   so the two stay in step. */
import { describe, expect, it } from "vitest";

import { TimelineEntrySchema } from "@/lib/data/schema";
import { groupTimeline, type LiveState, liveStateOf, type StreamItem } from "@/lib/data/thinking";

import vectors from "./thinking-vectors.json";

const shape = (items: StreamItem[]) =>
  items.map((i) =>
    i.type === "message"
      ? { type: "message", seq: i.entry.seq }
      : { type: "block", key: i.key, seqs: i.steps.map((s) => s.seq), state: i.state, verb: i.verb, seconds: i.seconds, blocked: i.blocked },
  );

describe("groupTimeline", () => {
  for (const c of vectors) {
    it(c.name, () => {
      const entries = c.entries.map((e) => TimelineEntrySchema.parse(e));
      expect(shape(groupTimeline(entries, c.live as LiveState, Date.parse(c.now)))).toEqual(c.expected);
    });
  }

  it("a line with no time counts no seconds", () => {
    const at = { seq: 1, at: null, type: "activity", who: "TOOL", kind: "line", text: "scan", tone: "default", rows: [] };
    const [block] = groupTimeline([TimelineEntrySchema.parse(at)], "running", Date.parse("2026-10-28T07:00:30+00:00"));
    expect(block.type === "block" && block.seconds).toBe(0);
  });

  it("reads a saved run's status as the last block's state", () => {
    expect(liveStateOf("Running")).toBe("running");
    expect(liveStateOf("Awaiting input")).toBe("paused");
    expect(liveStateOf("Stopped")).toBe("stopped");
    expect(liveStateOf("Interrupted")).toBe("stopped");
    expect(liveStateOf("Completed")).toBe("done");
    expect(liveStateOf("New")).toBe("done");
  });
});
