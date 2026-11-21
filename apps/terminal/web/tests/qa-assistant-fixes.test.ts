/* Evaluator-run fixes in the AI Assistant: "explain finding 001" shows that finding only, and a
   misspelt view name ("runlog") opens its view. */
import { describe, expect, it } from "vitest";

import { parseView } from "@/components/dashboard/view-url";
import { pickCards } from "@/lib/assistant/cards";
import { readIntent } from "@/lib/assistant/intent";
import { assessmentView } from "@/lib/data/adapt";

import { sampleAssessments } from "./fixtures";

describe("explain finding 001", () => {
  const samples = sampleAssessments();
  const run = samples.find((a) => a.findings.length > 1)!;
  const view = assessmentView(run);

  it("reads the number without its prefix", () => {
    expect(readIntent("explain finding 001").findingNumbers).toEqual([1]);
    expect(readIntent("what about finding #3?").findingNumbers).toEqual([3]);
  });

  it("shows that finding only, not the list", () => {
    const cards = pickCards(samples, view.uid, "explain finding 001");
    expect(cards.map((c) => c.kind)).toEqual(["finding"]);
    const card = cards[0] as Extract<(typeof cards)[number], { kind: "finding" }>;
    expect(Number(/(\d+)$/.exec(card.item.id)?.[1])).toBe(1);
  });
});

describe("view names", () => {
  it.each([
    ["runlog", "overview"],
    ["Run-Log", "overview"],
    ["log", "overview"],
    ["report", "reports"],
    ["findings", "findings"],
    ["audit", "overview"],
  ])("?view=%s opens %s", (name, view) => {
    expect(parseView(name)).toBe(view);
  });
});
