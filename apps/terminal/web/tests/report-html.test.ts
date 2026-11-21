/* The styled HTML, DOCX and JSON reports built from a saved assessment: structure, content,
   escaping, category/vulnerability/severity totals, and unvalidated scanner-claim labelling. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FindingDetail } from "@/components/dashboard/finding-detail";
import { apiFindingRow } from "@/lib/api/adapt";
import type { ApiFinding } from "@/lib/api/findings";
import { findingView } from "@/lib/data/adapt";
import type { Assessment, Finding } from "@/lib/data/schema";
import { CATEGORY_ORDER, findingCategory, reportCounts, severityForReport } from "@/lib/report/counts";
import { renderReportDocx } from "@/lib/report/docx/report";
import { counts, esc, percents, renderReportHtml, severityBlock } from "@/lib/report/html";
import { renderFile } from "@/lib/report/render";

import { findings as apiFindings } from "./fakes/core-api";
import { sampleAssessments } from "./fixtures";
import { unzip } from "./unzip";

const NOW = new Date("2026-10-05T12:00:00Z");
const assessment = sampleAssessments().find((a) => a.findings.length > 0 && a.scope)!;
const html = renderReportHtml(assessment, NOW);

const makeFinding = (overrides: Partial<Finding> & { id: string }): Finding => ({
  ...assessment.findings[0],
  severity: "HIGH",
  severity_override: "",
  effective_severity: "",
  status: "open",
  cvss_score: 7.5,
  cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
  validated_severity_status: undefined,
  validated_cvss_score: undefined,
  validated_cvss_vector: undefined,
  validated_cwe_ids: undefined,
  validated_cve_ids: undefined,
  finding_category: null,
  confidence_level: "UNKNOWN",
  evidence_quality: "UNKNOWN",
  verification_status: "UNKNOWN",
  exploitability: "UNKNOWN",
  classification_uncertainty: "",
  source_claims: [],
  review_history: [],
  evidence_summary: "",
  triage_note: "",
  ...overrides,
});

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

  it("labels unclassified historical snapshot ratings and identifiers as unvalidated claims without inflating rated counts", () => {
    const historical = { ...assessment, findings: assessment.findings.map(f => ({...f, finding_category: undefined, validated_severity_status: undefined})) };
    const html = renderReportHtml(historical, NOW);
    const counts = reportCounts(historical.findings);
    expect(counts.severity_counts).toEqual({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
    expect(counts.vulnerability_counts).toEqual({ CONFIRMED_VULNERABILITY: 0, POTENTIAL_VULNERABILITY: 0 });
    expect(counts.category_counts.INSUFFICIENT_EVIDENCE).toBe(
      assessment.findings.filter((f) => f.status !== "false-positive").length,
    );

    expect(html).toContain("Original rating (scanner/legacy claim; unvalidated)");
    expect(html).toContain("Scanner identifier claims (unvalidated)");
    expect(html).toContain("Scanner CVSS claim (unvalidated)");
    expect(html).toContain("Scanner CVSS vector claim (unvalidated)");
    expect(html).toContain("Severity totals cover 0 rated security finding(s) — no rated security findings.");

    const docxXml = unzip(renderReportDocx(historical, NOW)).get("word/document.xml") ?? "";
    expect(docxXml).toContain("Original rating (scanner/legacy claim; unvalidated)");
    expect(docxXml).toContain("Scanner identifier claims (unvalidated)");
    expect(docxXml).toContain("Scanner CVSS claim (unvalidated)");
    expect(docxXml).toContain("Scanner CVSS vector claim (unvalidated)");
    expect(docxXml).toContain("Scanner reference claims (unvalidated): ");
  });
});

describe("reportCounts and multi-format export consistency", () => {
  const taxonomyFindings: Finding[] = [
    makeFinding({
      id: "F-001",
      title: "Confirmed SQL injection",
      finding_category: "CONFIRMED_VULNERABILITY",
      severity: "CRITICAL",
      validated_severity_status: "CRITICAL",
      validated_cvss_score: 9.8,
      validated_cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      validated_cwe_ids: ["CWE-89"],
      validated_cve_ids: ["CVE-2026-1001"],
      confidence_level: "HIGH",
      evidence_quality: "HIGH",
      verification_status: "CONFIRMED",
      exploitability: "DEMONSTRATED",
      evidence_summary: "Boolean-based payload altered the search response.",
      classification_uncertainty: "Authenticated admin paths were not in scope.",
      source_claims: ["sqlmap: SQLI-001 · severity CRITICAL · CVSS 9.8 · CWE-89"],
      review_history: ["2026-10-05T11:00:00Z · OPEN → OPEN · by analyst"],
      triage_note: "Verified on staging search endpoint.",
    }),
    makeFinding({
      id: "F-002",
      title: "Potential SSRF in webhook preview",
      finding_category: "POTENTIAL_VULNERABILITY",
      severity: "HIGH",
      validated_severity_status: "HIGH",
      validated_cvss_score: 7.2,
    }),
    makeFinding({
      id: "F-003",
      title: "Permissive CORS on API",
      finding_category: "SECURITY_MISCONFIGURATION",
      severity: "MEDIUM",
      validated_severity_status: "MEDIUM",
      validated_cvss_score: 5.3,
    }),
    makeFinding({
      id: "F-004",
      title: "Missing CSP header",
      finding_category: "SECURITY_HARDENING_RECOMMENDATION",
      severity: "LOW",
      validated_severity_status: "LOW",
    }),
    makeFinding({
      id: "F-005",
      title: "Open HTTP port 3000",
      finding_category: "INFORMATIONAL_DISCOVERY",
      severity: "CRITICAL", // even if raw severity was high/critical, discovery never inflates rated counts or leads summary
      validated_severity_status: "NONE",
    }),
    makeFinding({
      id: "F-006",
      title: "Scanner noise on static asset",
      finding_category: "CONFIRMED_VULNERABILITY",
      severity: "CRITICAL",
      validated_severity_status: "CRITICAL",
      status: "false-positive", // analyst false-positive overrides category to FALSE_POSITIVE
    }),
    makeFinding({
      id: "F-007",
      title: "Classifier false positive",
      finding_category: "FALSE_POSITIVE",
      severity: "HIGH",
      validated_severity_status: "NONE",
    }),
    makeFinding({
      id: "F-008",
      title: "Unverified banner match",
      finding_category: null, // historical unclassified -> INSUFFICIENT_EVIDENCE & UNKNOWN severity
      severity: "HIGH",
      cvss_score: 8.1,
    }),
    makeFinding({
      id: "F-009",
      title: "Partial classification without validated severity",
      finding_category: "POTENTIAL_VULNERABILITY",
      severity: "HIGH",
      validated_severity_status: null, // explicitly unrated
    }),
  ];

  const classifiedAssessment: Assessment = {
    ...assessment,
    findings: taxonomyFindings,
  };

  it("partitions all 7 categories and restricts vulnerability_counts and severity_counts", () => {
    const counts = reportCounts(taxonomyFindings);
    expect(Object.keys(counts.category_counts)).toEqual([...CATEGORY_ORDER]);
    expect(counts.category_counts).toEqual({
      CONFIRMED_VULNERABILITY: 1,
      POTENTIAL_VULNERABILITY: 2,
      SECURITY_MISCONFIGURATION: 1,
      SECURITY_HARDENING_RECOMMENDATION: 1,
      INFORMATIONAL_DISCOVERY: 1,
      FALSE_POSITIVE: 2,
      INSUFFICIENT_EVIDENCE: 1,
    });
    expect(counts.vulnerability_counts).toEqual({
      CONFIRMED_VULNERABILITY: 1,
      POTENTIAL_VULNERABILITY: 2,
    });
    expect(counts.severity_counts).toEqual({
      CRITICAL: 1,
      HIGH: 1,
      MEDIUM: 1,
      LOW: 0,
    });
    expect(findingCategory(taxonomyFindings[5])).toBe("FALSE_POSITIVE");
    expect(severityForReport(taxonomyFindings[7])).toBe("UNKNOWN");
    expect(severityForReport(taxonomyFindings[8])).toBe("UNKNOWN");
  });

  it("exports consistent counts and classification details across JSON, HTML, and DOCX", () => {
    const jsonExport = JSON.parse(String(renderFile("json", classifiedAssessment))) as Assessment & ReturnType<typeof reportCounts>;
    const expectedCounts = reportCounts(taxonomyFindings);
    expect(jsonExport.severity_counts).toEqual(expectedCounts.severity_counts);
    expect(jsonExport.category_counts).toEqual(expectedCounts.category_counts);
    expect(jsonExport.vulnerability_counts).toEqual(expectedCounts.vulnerability_counts);

    const htmlOut = renderReportHtml(classifiedAssessment, NOW);
    const docxXml = unzip(renderReportDocx(classifiedAssessment, NOW)).get("word/document.xml") ?? "";

    for (const docText of [htmlOut, docxXml]) {
      expect(docText).toContain("Vulnerability counts: 1 confirmed · 2 potential.");
      expect(docText).toContain("Severity totals cover 3 rated security finding(s) — 1 Critical, 1 High, 1 Medium.");
      expect(docText).toContain("Confirmed SQL injection");
      expect(docText).toContain("DEMONSTRATED");
      expect(docText).toContain("Boolean-based payload altered the search response.");
      expect(docText).toContain("Authenticated admin paths were not in scope.");
      expect(docText).toContain("sqlmap: SQLI-001");
      expect(docText).toContain("2026-10-05T11:00:00Z");
      expect(docText).toContain("Verified on staging search endpoint.");
      expect(docText).toContain("CWE-89, CVE-2026-1001");
      expect(docText).toContain("Validated CVSS");
      expect(docText).toContain("9.8");
      // Never led by the false positive or informational discovery
      expect(docText).not.toContain("led by Open HTTP port 3000");
      expect(docText).not.toContain("led by Scanner noise on static asset");
    }
    expect(htmlOut).toContain("led by <b>Confirmed SQL injection</b>");
    expect(docxXml).toContain("led by Confirmed SQL injection");
  });
});

describe("FindingDetail component", () => {
  it("renders full classification, evidence summary, scanner claims, review history, and analyst note", () => {
    const apiRow = apiFindingRow({
      ...(apiFindings[0] as unknown as ApiFinding),
      finding_category: "CONFIRMED_VULNERABILITY",
      validated_severity_status: "HIGH",
      validated_cvss_score: "8.6",
      validated_cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L",
      validated_cwe_ids: ["CWE-89"],
      validated_cve_ids: ["CVE-2026-2002"],
      confidence_level: "HIGH",
      evidence_quality: "HIGH",
      verification_status: "CONFIRMED",
      exploitability: "DEMONSTRATED",
      classification_uncertainty: "Rate limiting was not tested.",
      evidence: [
        { kind: "analysis_summary", content: "Error-based SQL response confirmed injection.", location: null },
        { kind: "REQUEST", content: "GET /rest/products/search?q='", location: "q" },
      ],
      source_claims: [
        {
          source_tool: "sqlmap",
          scanner_id: "SQLI-SEARCH",
          source_severity: "HIGH",
          source_cvss_score: 8.6,
          source_cwe_ids: ["CWE-89"],
        },
      ],
      review_history: [
        {
          previous_status: "OPEN",
          finding_status: "FIXED",
          reviewed_by: "operator@lab",
          reviewed_at: "2026-11-18T10:00:00Z",
        },
      ],
    });
    const withNote = {
      ...apiRow,
      triageNote: "Patched with parameterized query in PR #42.",
    };

    const markup = renderToStaticMarkup(
      createElement(FindingDetail, {
        finding: withNote,
        position: { index: 0, total: 1 },
        prev: null,
        next: null,
        onSelect: () => {},
      }),
    );

    expect(markup).toContain("CONFIRMED VULNERABILITY");
    expect(markup).toContain("DEMONSTRATED");
    expect(markup).toContain("Rate limiting was not tested.");
    expect(markup).toContain("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L");
    expect(markup).toContain("Error-based SQL response confirmed injection.");
    expect(markup).toContain("Original scanner claims (unvalidated)");
    expect(markup).toContain("sqlmap: SQLI-SEARCH");
    expect(markup).toContain("Analyst review history");
    expect(markup).toContain("OPEN → FIXED · by operator@lab");
    expect(markup).toContain("Analyst note");
    expect(markup).toContain("Patched with parameterized query in PR #42.");
    expect(markup).toContain("CWE-89 · CVE-2026-2002");

    // Also verify findingView does not expose legacy cvss_vector as validatedCvssVector when unclassified
    const unclassifiedView = findingView(makeFinding({ id: "010", finding_category: null }));
    expect(unclassifiedView.validatedCvssVector).toBe("");
  });
});

// The 9-finding mix from the bug report: 2 NONE and 1 UNKNOWN used to vanish from the counts.
const MIX = ["HIGH", "MEDIUM", "MEDIUM", "MEDIUM", "MEDIUM", "LOW", "NONE", "NONE", "UNKNOWN"];
const mixed = MIX.map((severity, i) => ({ ...assessment.findings[0], id: `F-${i}`, severity })) as typeof assessment.findings;

describe("finding cards in print", () => {
  it("leave out a blank section and may split across pages", () => {
    const blank = assessment.findings.map((f) => ({ ...f, impact: "" }));
    const out = renderReportHtml({ ...assessment, findings: blank });
    expect(out).not.toContain(">Impact<");
    expect(out).toContain(">Remediation<");
    expect(out).not.toContain(".find,tr{break-inside:avoid}");
    expect(out).toContain("counter(pages)");
  });
});

describe("severity counts with NONE and UNKNOWN", () => {
  it("adds up to the total in the tiles, and the shares to 100%", () => {
    const c = counts(mixed);
    expect(c).toEqual({ CRITICAL: 0, HIGH: 1, MEDIUM: 4, LOW: 1, UNKNOWN: 1, NONE: 2 });
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(9);
    expect(Object.values(percents(c)).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percents({ NONE: 3, LOW: 0 })).toEqual({ NONE: 100, LOW: 0 });
    expect(counts([{ severity: "INFO" as never }]).UNKNOWN).toBe(1);
  });

  it("shows them as tiles, bar segments and in the summary sentence", () => {
    const block = severityBlock(mixed);
    expect(block).toContain('<div class="tile none"><div class="n">2</div><div class="k">None</div>');
    expect(block).toContain('<div class="tile unk"><div class="n">1</div><div class="k">Unknown</div>');
    expect(block).toContain('<i class="none" style="width:22%">22%</i>');
    expect(block).toContain('<div class="tile tot"><div class="n">9</div>');
    expect(renderReportHtml({ ...assessment, findings: mixed })).toContain("1 High, 4 Medium, 1 Low, 2 None, 1 Unknown");
  });
});
