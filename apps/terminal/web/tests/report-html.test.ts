/* The styled HTML report built from a saved assessment: structure, content, and escaping. */
import { describe, expect, it } from "vitest";

import { esc, findingVerification, renderReportHtml } from "@/lib/report/html";
import { renderReportDocx } from "@/lib/report/docx/report";
import { maskAssessment } from "@/lib/report/mask";

import { sampleAssessments } from "./fixtures";
import { unzip } from "./unzip";

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

  it("keeps legacy source-pattern claims separate from verified vulnerabilities in PDF and Word", () => {
    const pattern = {
      ...assessment.findings[0], validation: "CONFIRMED", finding_category: "POTENTIAL_VULNERABILITY",
      confidence_level: "HIGH", evidence_quality: "PLAUSIBLE", effective_verification: null,
    };
    const saved = maskAssessment({ ...assessment, findings: [pattern] });
    const html = renderReportHtml(saved);
    const word = unzip(renderReportDocx(saved)).get("word/document.xml")!;
    for (const report of [html, word]) {
      expect(report).toContain("Potential vulnerability");
      expect(report).toContain("Legacy, not verified");
      expect(report).toContain("Plausible");
      expect(report).toContain("A scanner claim alone is not verified proof.");
      expect(report).not.toMatch(/>Confirmed<|>Verified</);
    }
    expect(findingVerification(pattern)).toBe("Legacy, not verified");
    expect(findingVerification({ ...pattern, effective_verification: {
      status: "VERIFIED", legacy: false, proof_lines: [],
    } })).toBe("Legacy, not verified");
  });

  it("prints escaped, masked typed proof only when the snapshot records it", () => {
    const verified = {
      ...assessment.findings[0], effective_verification: {
        status: "VERIFIED", legacy: false, reason: "Matched response <marker>",
        proof_lines: ["password=do-not-export <proof>"],
      },
    };
    const saved = maskAssessment({ ...assessment, findings: [verified] });
    expect(findingVerification(saved.findings[0])).toBe("VERIFIED");
    const html = renderReportHtml(saved);
    const word = unzip(renderReportDocx(saved)).get("word/document.xml")!;
    for (const report of [html, word]) {
      expect(report).not.toContain("do-not-export");
      expect(report).not.toContain("<proof>");
      expect(report).toContain("&lt;proof&gt;");
      expect(report).toContain("Verified");
    }
  });
});
