/* How the Security knowledge page words a file (lib/knowledge/format.ts), the search over names,
   the index's new fields (an older entry reads as the terminal's, with no original), and its view
   in the address (view-url.ts). */
import { describe, expect, it } from "vitest";

import { parseView, VIEWS } from "@/components/dashboard/view-url";
import { IndexEntrySchema } from "@/lib/assistant/knowledge/schema";
import { humanSize, matchName, opensInline, sourceLine } from "@/lib/knowledge/format";
import type { KnowledgeItem } from "@/lib/knowledge/types";

const item = (over: Partial<KnowledgeItem>): KnowledgeItem => ({
  id: "a".repeat(32),
  name: "runbook.md",
  kind: "md",
  bytes: 1000,
  chunks: 1,
  addedAt: "2026-10-22T09:30:00Z",
  source: "web",
  original: true,
  ...over,
});

describe("the wording", () => {
  it("sizes in B, KB and MB (1 KB = 1,024 bytes), one decimal under 10", () => {
    expect(humanSize(0)).toBe("0 B");
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(1024)).toBe("1 KB");
    expect(humanSize(3482)).toBe("3.4 KB");
    expect(humanSize(348_160)).toBe("340 KB");
    expect(humanSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
    expect(humanSize(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("names the source with the type and size", () => {
    expect(sourceLine(item({ source: "web", kind: "pdf", bytes: 1.2 * 1024 * 1024 }))).toBe("Web upload · PDF · 1.2 MB");
    expect(sourceLine(item({ source: "terminal", kind: "md", bytes: 3482 }))).toBe("Terminal (/add-on) · MD · 3.4 KB");
  });

  it("opens everything but a Word file in the browser", () => {
    expect(["pdf", "txt", "md", "json", "yaml"].every((k) => opensInline(k as KnowledgeItem["kind"]))).toBe(true);
    expect(opensInline("docx")).toBe(false);
  });

  it("searches names, ignoring case and surrounding spaces", () => {
    const files = [item({ id: "1".repeat(32), name: "Quokka-Runbook.md" }), item({ id: "2".repeat(32), name: "policy.pdf" })];
    expect(matchName(files, "  runbook ").map((f) => f.name)).toEqual(["Quokka-Runbook.md"]);
    expect(matchName(files, "")).toHaveLength(2);
    expect(matchName(files, "nothing")).toEqual([]);
  });
});

describe("the index's source and original", () => {
  const entry = { id: "a".repeat(32), name: "a.md", kind: "md", bytes: 1, chunks: 1, added_at: "2026-10-22T09:30:00+00:00" };

  it("default to the terminal and no original for an older entry", () => {
    expect(IndexEntrySchema.parse(entry)).toMatchObject({ source: "terminal", original: false });
    expect(IndexEntrySchema.parse({ ...entry, source: "web", original: true })).toMatchObject({ source: "web", original: true });
  });

  it("stay strict", () => {
    expect(IndexEntrySchema.safeParse({ ...entry, source: "cloud" }).success).toBe(false);
    expect(IndexEntrySchema.safeParse({ ...entry, original: "yes" }).success).toBe(false);
    expect(IndexEntrySchema.safeParse({ ...entry, path: "/home/me/a.md" }).success).toBe(false);
  });
});

describe("the Security knowledge view", () => {
  it("is a view of its own in the address", () => {
    expect(VIEWS).toContain("knowledge");
    expect(parseView("knowledge")).toBe("knowledge");
  });
});
