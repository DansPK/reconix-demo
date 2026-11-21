import { describe, expect, it } from "vitest";

import { forget, switchAsk, type SwitchState } from "@/components/assistant/switch-rules";

const A = { uid: "run-a", label: "RCX-DEMO-001" };
const B = { uid: "run-b", label: "RCX-DEMO-002" };
const ALL = { uid: null, label: "All runs" };

// a saved chat about A with messages, while the dashboard shows B, not answered yet
const base: SwitchState = { id: "c1", about: A, page: B, messages: 2, opening: false, answered: null };

describe("switchAsk", () => {
  it("asks when the open chat is about another run than the dashboard shows", () => {
    expect(switchAsk(base)).toEqual({ id: "c1", from: A, to: B });
  });

  it("asks when the dashboard moves to every run (no uid)", () => {
    expect(switchAsk({ ...base, page: ALL })).toEqual({ id: "c1", from: A, to: ALL });
  });

  it("never asks for a new chat (it follows the dashboard)", () => {
    expect(switchAsk({ ...base, id: null })).toBeNull();
  });

  it("never asks for an empty chat or while a chat is being read", () => {
    expect(switchAsk({ ...base, messages: 0 })).toBeNull();
    expect(switchAsk({ ...base, opening: true })).toBeNull();
  });

  it("never asks when the chat is about the dashboard's run", () => {
    expect(switchAsk({ ...base, page: A })).toBeNull();
  });

  it("asks once per switch: an answered pair is not asked again", () => {
    expect(switchAsk({ ...base, answered: { id: "c1", uid: "run-b" } })).toBeNull();
  });

  it("asks again when the dashboard moves on to a third run", () => {
    const C = { uid: "run-c", label: "RCX-DEMO-003" };
    expect(switchAsk({ ...base, page: C, answered: { id: "c1", uid: "run-b" } })).toEqual({ id: "c1", from: A, to: C });
  });
});

describe("forget", () => {
  it("keeps nothing to forget when nothing was answered", () => {
    expect(forget(base)).toBe(false);
  });

  it("keeps the answer while the same chat and the same switch hold", () => {
    expect(forget({ ...base, answered: { id: "c1", uid: "run-b" } })).toBe(false);
  });

  it("forgets the answer when the dashboard is back on the chat's own run", () => {
    expect(forget({ ...base, page: A, answered: { id: "c1", uid: "run-b" } })).toBe(true);
  });

  it("forgets the answer when another chat is open", () => {
    expect(forget({ ...base, id: "c2", answered: { id: "c1", uid: "run-b" } })).toBe(true);
    expect(forget({ ...base, id: null, answered: { id: "c1", uid: "run-b" } })).toBe(true);
  });
});
