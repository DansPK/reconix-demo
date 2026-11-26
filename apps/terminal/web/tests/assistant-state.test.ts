import { describe, expect, it } from "vitest";

import {
  canRetryLast,
  completedStreamOutcome,
  createEpochGuard,
  isStaleStream,
  resolveAskScope,
  scrollTriggerKey,
  viewSessionKey,
} from "@/lib/assistant/chat-state";

describe("chat state guards", () => {
  it("blocks retry before slicing messages when reading is active or model is unconfigured", () => {
    const msgs = [
      { id: "u1", role: "user" as const, content: "hi" },
      { id: "a1", role: "assistant" as const, content: "", state: "error" as const, question: "hi" },
    ];
    expect(canRetryLast(msgs, { hasStream: false, reading: true, configured: true })).toBeNull();
    expect(canRetryLast(msgs, { hasStream: false, reading: false, configured: false })).toBeNull();
    expect(canRetryLast(msgs, { hasStream: true, reading: false, configured: true })).toBeNull();
    expect(canRetryLast(msgs, { hasStream: false, reading: false, configured: true })?.id).toBe("a1");
  });

  it("identifies halted or superseded stream controllers so finally/catch ignores stale runs", () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    expect(isStaleStream(null, c1)).toBe(true);
    expect(isStaleStream(c2, c1)).toBe(true);
    expect(isStaleStream(c1, c1)).toBe(false);
    c1.abort();
    expect(isStaleStream(c1, c1)).toBe(true);
  });

  it("epoch guard invalidates in-flight history loads when a newer load or delete occurs", () => {
    const guard = createEpochGuard();
    const req1 = guard.next();
    expect(guard.isCurrent(req1)).toBe(true);
    guard.next();
    expect(guard.isCurrent(req1)).toBe(false);
  });

  it("scrollTriggerKey depends on the latest user message, not server conversationId assignment", () => {
    const msgs = [
      { id: "u1", role: "user" as const, content: "hi" },
      { id: "a1", role: "assistant" as const, content: "", state: "streaming" as const },
    ];
    expect(scrollTriggerKey(msgs)).toBe("u1");
    expect(scrollTriggerKey([])).toBeNull();
  });

  it("keeps a distinct viewSessionKey when switching between saved conversations so seen mark resets", () => {
    const m1 = [{ id: "u1", role: "user" as const, content: "q1" }];
    const m2 = [{ id: "u2", role: "user" as const, content: "q2" }];
    expect(viewSessionKey(m1, "c1")).not.toBe(viewSessionKey(m2, "c2"));
    expect(viewSessionKey(m1, null)).toBe("u1");
    expect(viewSessionKey(m1, "c1")).toBe("u1");
  });

  it("keeps the open conversation scope when continuing a chat after switching the page run", () => {
    const openedScope = { uid: "run-a", label: "RCX-001" };
    const dashboardScope: { uid: string | null; label: string } = { uid: "run-b", label: "RCX-002" };
    expect(resolveAskScope(openedScope, dashboardScope)).toEqual(openedScope);
    expect(resolveAskScope({ uid: null, label: "All assessments" }, dashboardScope)).toEqual({ uid: null, label: "All assessments" });
    expect(resolveAskScope(undefined, dashboardScope)).toEqual(dashboardScope);
  });

  it("marks a resolved aborted stream as stopped unless superseded or halted", () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    expect(completedStreamOutcome(c1, c1)).toBe("apply");
    expect(completedStreamOutcome(null, c1)).toBe("drop");
    expect(completedStreamOutcome(c2, c1)).toBe("drop");
    c1.abort();
    expect(completedStreamOutcome(c1, c1)).toBe("stopped");
  });
});
