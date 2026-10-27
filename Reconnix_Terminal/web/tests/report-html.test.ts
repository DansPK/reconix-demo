/* The styled HTML report built from a saved assessment: structure, content, and escaping. */
import { describe, expect, it } from "vitest";

import { esc, renderReportHtml } from "@/lib/report/html";

import { sampleAssessments } from "./fixtures";

const assessment = sampleAssessments().find((a) => a.findings.length > 0 && a.scope)!;
const html = renderReportHtml(assessment, new Date("2026-10-05T12:00:00Z"));

describe("HTML report", () => {
  it("is a complete document with the report's sections", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const text of ["Security Assessment Report", "Executive summary", "Findings summary", "Detailed findings", "Policy &amp; governance"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Generated 2026-10-05");
  });

  it("shows every finding with its severity and the engagement facts", () => {
    for (const f of assessment.findings) expect(html).toContain(esc(f.title));
    expect(html).toContain(esc(assessment.target_url || assessment.target));
    expect(html).toContain(`${assessment.findings.length} findings`);
  });

  it("carries no scripts and escapes markup in saved text", () => {
    expect(html).not.toContain("<script");
    // the HTML is only the PDF's source and the preview: no print toolbar or "save as PDF" hint
    expect(html).not.toMatch(/toolbar|Ctrl\+P|save as PDF/i);
    const hostile = { ...assessment, findings: [{ ...assessment.findings[0], title: '<img src=x onerror="alert(1)">' }] };
    const out = renderReportHtml(hostile as typeof assessment);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
