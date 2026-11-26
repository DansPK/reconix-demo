/* The reply stream's frames (lib/assistant/protocol.ts), shared by the route and the page:
   encoding, reading lines split anywhere, and refusing what isn't a frame. Also the system
   prompt's notes about the cards shown next to an answer. */
import { describe, expect, it } from "vitest";

import { NOTICES, pickCards } from "@/lib/assistant/cards";
import { cleanTitle } from "@/lib/assistant/history-schema";
import { CardSchema, createFrameReader, encodeFrame, type Frame, isConversationId, parseFrame } from "@/lib/assistant/protocol";
import { HIDDEN_LINE, MASK } from "@/lib/assistant/redact";

import { sampleAssessments } from "./fixtures";

const ID = "0b0e2d55-1c5a-4b1e-9b8c-2f1d3c4b5a69";
const samples = sampleAssessments();
const frames: Frame[] = [
  { t: "meta", conversationId: ID, title: "What waits on me?", scope: { uid: null, label: "All assessments" } },
  ...pickCards(samples, null, "Analyze the findings, the progress and what waits on my approval").map((card) => ({ t: "card" as const, card })),
  { t: "text", delta: "Here is what " },
  { t: "text", delta: "the data says: ünïcode ✓\nnext line" },
  { t: "sources", items: [{ ref_id: "CVE-2021-44228", title: "Apache Log4j2 remote code execution", url: "https://nvd.nist.gov/vuln/detail/CVE-2021-44228", source: "CVE", section: "Description" }] },
  { t: "error", detail: "The AI model stopped answering." },
  { t: "done" },
];

describe("frames", () => {
  it("are one JSON line each and read back as they were", () => {
    for (const f of frames) {
      const line = encodeFrame(f);
      expect(line.endsWith("\n")).toBe(true);
      expect(line.slice(0, -1)).not.toContain("\n");
      expect(parseFrame(line)).toEqual(f);
    }
  });
  it("are read from chunks split anywhere, even inside a character", () => {
    const bytes = new TextEncoder().encode(frames.map(encodeFrame).join(""));
    for (const size of [1, 3, 7, 64]) {
      const seen: Frame[] = [];
      const reader = createFrameReader((f) => seen.push(f));
      const decoder = new TextDecoder();
      for (let i = 0; i < bytes.length; i += size) reader.push(decoder.decode(bytes.subarray(i, i + size), { stream: true }));
      reader.push(decoder.decode());
      reader.end();
      expect(seen).toEqual(frames);
    }
  });
  it.each([
    ["not JSON", "{broken"],
    ["an unknown kind", JSON.stringify({ t: "html", html: "<script>" })],
    ["an extra field", JSON.stringify({ t: "done", run: "rm -rf" })],
    ["a bad conversation id", JSON.stringify({ t: "meta", conversationId: "../x", title: "x", scope: { uid: null, label: "x" } })],
    ["a card linking to a made-up run", JSON.stringify({ t: "card", card: { kind: "report", runs: [{ run: { uid: "javascript:alert(1)", label: "x", when: "y" }, status: "Completed" }], more: 0 } })],
    ["a card with a made-up severity", JSON.stringify({ t: "card", card: { kind: "findings", total: 1, counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, items: [{ id: "F", title: "t", severity: "APOCALYPTIC", cvss: 1, target: "t", review: "review", run: { uid: samples[0].uid, label: "x", when: "y" } }], runs: 1 } })],
    // Info is no severity any more: a live frame never carries it (only saved conversations do)
    ["a card counting INFO", JSON.stringify({ t: "card", card: { kind: "findings", total: 0, counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }, items: [], runs: 0 } })],
    ["a card listing an INFO finding", JSON.stringify({ t: "card", card: { kind: "finding", item: { id: "F", title: "t", severity: "INFO", cvss: null, target: "t", review: "review", run: { uid: samples[0].uid, label: "x", when: "y" } }, cwe: "—", tool: "—", description: "", impact: "", remediation: [] } })],
    ["a notice with an action that does something", JSON.stringify({ t: "card", card: { ...NOTICES.act, action: "approve" } })],
    ["sources with an empty list", JSON.stringify({ t: "sources", items: [] })],
    ["a citation holding an extra field", JSON.stringify({ t: "sources", items: [{ ref_id: "A", title: "t", url: "", source: "CVE", section: "", onclick: "alert(1)" }] })],
    ["a citation whose url is not a string", JSON.stringify({ t: "sources", items: [{ ref_id: "A", title: "t", url: { toString: 1 }, source: "CVE", section: "" }] })],
  ])("skip %s", (_name, line) => {
    expect(parseFrame(line)).toBeNull();
  });
  it("reads a findings card saved while the scale had only the four levels, the unrated ones at 0", () => {
    const card = pickCards(samples, null, "Analyze the findings").find((c) => c.kind === "findings")!;
    const four = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const parsed = CardSchema.safeParse({ ...card, counts: four });
    expect(parsed.success && parsed.data.kind === "findings" && parsed.data.counts).toEqual({ ...four, UNKNOWN: 0, NONE: 0 });
  });
  it("names conversations by random v4 UUIDs only", () => {
    expect(isConversationId(ID)).toBe(true);
    for (const bad of ["", "x", ID.toUpperCase(), `${ID}x`, "00000000-0000-1000-8000-000000000000", 42]) expect(isConversationId(bad)).toBe(false);
  });
  it("carries the approvals' counts over every decision, as non-negative whole numbers", () => {
    const card = pickCards(samples, null, "What waits on my approval?").find((c) => c.kind === "approvals")!;
    expect(card.kind === "approvals" && card.counts).toEqual({ APPROVED: expect.any(Number), REJECTED: expect.any(Number), PENDING: expect.any(Number), "NOT REACHED": expect.any(Number) });
    expect(CardSchema.safeParse(card).success).toBe(true);
    const bad = (counts: unknown) => CardSchema.safeParse({ ...card, counts }).success;
    expect(bad({ APPROVED: -1, REJECTED: 0, PENDING: 0, "NOT REACHED": 0 })).toBe(false);
    expect(bad({ APPROVED: 1.5, REJECTED: 0, PENDING: 0, "NOT REACHED": 0 })).toBe(false);
    expect(bad({ APPROVED: 1, REJECTED: 0, PENDING: 0 })).toBe(false); // a state missing
    expect(bad({ APPROVED: 1, REJECTED: 0, PENDING: 0, "NOT REACHED": 0, FAILED: 0 })).toBe(false); // a state that isn't one
    expect(bad(undefined)).toBe(true); // a card saved before the field
  });
  it("carries a blocked request's method, path and reason, each a line, or an older card's text alone", () => {
    const card = pickCards(samples, null, "What did the policy block?").find((c) => c.kind === "policy")!;
    expect(card.kind === "policy" && card.items[0]).toMatchObject({ method: expect.any(String), path: expect.any(String), reason: expect.any(String) });
    expect(CardSchema.safeParse(card).success).toBe(true);
    if (card.kind !== "policy") throw new Error("not a policy card");
    const { run, time, text } = card.items[0]; // a card saved before the three fields
    expect(CardSchema.safeParse({ ...card, items: [{ run, time, text }] }).success).toBe(true);
    expect(CardSchema.safeParse({ ...card, items: [{ ...card.items[0], reason: "x".repeat(401) }] }).success).toBe(false);
  });
  it("lets every built notice pass", () => {
    for (const notice of Object.values(NOTICES)) expect(CardSchema.safeParse(notice).success).toBe(true);
  });
});

describe("titles", () => {
  it("are masked, one line, without invisible characters, and cut", () => {
    expect(cleanTitle("  Why\nis​ the ‮odd  ")).toBe("Why is the odd");
    expect(cleanTitle("  Why\nis token=abc123 odd  ")).toBe(`Why is token=${MASK} odd`);
    // a line hiding a secret behind invisible characters is hidden whole (redact's HIDDEN_LINE)
    expect(cleanTitle("Why\nis​ token=abc123 ‮odd")).toBe(`Why ${HIDDEN_LINE}`);
    const long = cleanTitle("word ".repeat(40), 60);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(cleanTitle(" \u0007 ")).toBe("");
  });
});
