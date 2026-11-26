/* Marking references in a passage, and the snippets of "Mentions" (lib/knowledge/highlight.ts). */
import { describe, expect, it } from "vitest";

import { matchedRanges, partsOf, snippetOf, splitHighlightSegments } from "@/lib/knowledge/highlight";

const text = "Use sqlmap for SQL injection (CWE-89) in the search form.";
const span = (type: string, ref_id: string, word: string) => ({ type, ref_id, start: text.indexOf(word), end: text.indexOf(word) + word.length });
const spans = [span("TOOL", "SQLMAP", "sqlmap"), span("TOPIC", "sql-injection", "sqlmap"), span("TOPIC", "sql-injection", "SQL injection"), span("CWE", "CWE-89", "CWE-89")];

describe("partsOf", () => {
  it("marks every reference once, keeps the text whole and drops overlaps", () => {
    const parts = partsOf(text, spans);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.span).map((p) => [p.span!.type, p.text])).toEqual([
      ["TOOL", "sqlmap"],
      ["TOPIC", "SQL injection"],
      ["CWE", "CWE-89"],
    ]);
  });
  it("ignores spans outside the text", () => {
    expect(partsOf("short", [{ type: "CWE", ref_id: "CWE-1", start: 2, end: 99 }])).toEqual([{ text: "short", span: null }]);
  });
});

describe("snippetOf", () => {
  it("cuts around the first place a reference is named, with its marks moved to fit", () => {
    const long = `${"a ".repeat(200)}${text}${" b".repeat(200)}`;
    const shift = 400;
    const moved = spans.map((s) => ({ ...s, start: s.start + shift, end: s.end + shift }));
    const snip = snippetOf(long, moved, "CWE", "CWE-89", 40)!;
    expect(snip.text.startsWith("…")).toBe(true);
    expect(snip.text.endsWith("…")).toBe(true);
    const cwe = snip.spans.find((s) => s.type === "CWE")!;
    expect(snip.text.slice(cwe.start, cwe.end)).toBe("CWE-89");
  });
  it("is null when the reference is not named there", () => {
    expect(snippetOf(text, spans, "CVE", "CVE-2021-44228")).toBeNull();
  });
});

describe("matchedRanges and splitHighlightSegments", () => {
  it("highlights only the passage sentences overlapping the AI answer while keeping inner spans", () => {
    const passage =
      "Unrelated introductory header.\nBroken Access Control maps to CWE-200 and SSRF vulnerabilities.\nMaturity checks follow next.";
    const answer = "The model cites Broken Access Control and CWE-200 along with SSRF.";
    const cweStart = passage.indexOf("CWE-200");
    const ranges = matchedRanges(passage, answer);
    expect(ranges).toHaveLength(1);
    expect(passage.slice(ranges[0]!.start, ranges[0]!.end)).toBe(
      "Broken Access Control maps to CWE-200 and SSRF vulnerabilities.",
    );

    const segments = splitHighlightSegments(
      passage,
      [{ type: "CWE", ref_id: "CWE-200", start: cweStart, end: cweStart + 7 }],
      ranges,
    );
    expect(segments.map((s) => s.text).join("")).toBe(passage);
    const used = segments.find((s) => s.highlighted)!;
    expect(used.text).toContain("Broken Access Control");
    expect(used.parts.some((p) => p.span?.ref_id === "CWE-200")).toBe(true);
  });

  it("excludes tangential sentences that only share a couple of keywords in a longer passage", () => {
    const passage =
      "program as the best way to avoid these risks, and more. In this section we will cover how to start and build a modern application security program.\n" +
      "If you already have an application security program, consider performing a maturity assessment on it using OWASP SAMM or DSOMM.\n" +
      "Please note: you do not need to do everything in OWASP SAMM or DSOMM to be doing a good job, they are meant to guide you.";
    const answer =
      "Establishing and building a modern application security program is the best way to avoid these risks. Maturity assessments using OWASP SAMM or DSOMM can guide improvement.";
    const selected = matchedRanges(passage, answer).map((r) => passage.slice(r.start, r.end));
    expect(selected.some((s) => s.includes("best way to avoid these risks"))).toBe(true);
    expect(selected.some((s) => s.includes("modern application security program"))).toBe(true);
    expect(selected.some((s) => s.includes("performing a maturity assessment"))).toBe(true);
    expect(selected.some((s) => s.includes("do not need to do everything"))).toBe(false);
  });
});
