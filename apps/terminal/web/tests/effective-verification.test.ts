import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FindingDetail, preferredProofLine } from "@/components/dashboard/finding-detail";
import { apiFindingRow } from "@/lib/api/adapt";
import type { ApiFinding } from "@/lib/api/findings";
import { type Finding } from "@/lib/data/schema";
import { evidenceValidation, validationLine } from "@/lib/report/html";

const sampleApiFinding: ApiFinding = {
  finding_id: "11111111-1111-4111-8111-111111111111",
  assessment_id: "22222222-2222-4222-8222-222222222222",
  code: "F-001",
  title: "SQL Injection",
  target: "https://target.local/search",
  description: "Scanner found SQL injection",
  severity_status: "HIGH",
  cvss_score: "8.5",
  cwe_ids: ["CWE-89"],
  owasp_id: ["A03:2021"],
  cve_ids: [],
  impact: "Data compromise",
  remediation: "Prepared statements",
  validation_status: "UNCONFIRMED",
  finding_status: "OPEN",
  finding_category: "CONFIRMED_VULNERABILITY",
  tools: ["sqlmap"],
  evidence: [],
  effective_verification: {
    status: "VERIFIED",
    kind: "SQLI",
    subject: { parameter: "q" },
    verifier: "SQLMAP",
    proof_lines: ["parameter 'q' is vulnerable"],
    legacy: false,
    reason: "Confirmed by payload",
  },
  ai_notes: {
    schema_version: 1,
    explanation: "AI explains SQL injection",
    impact: "AI details impact",
    remediation: "AI remediation steps",
    uncertainty: "None",
    evidence_summary: "Evidence confirmed",
    suggested_category: "CONFIRMED_VULNERABILITY",
    evidence_refs: [],
    model: "gpt-5-test",
  },
};

describe("effective verification adapter", () => {
  it("adapts effective_verification and ai_notes correctly", () => {
    const row = apiFindingRow(sampleApiFinding);
    expect(row.effectiveVerification).toBeDefined();
    expect(row.effectiveVerification?.status).toBe("VERIFIED");
    expect(row.effectiveVerification?.verifier).toBe("SQLMAP");
    expect(row.effectiveVerification?.proofLines).toEqual(["parameter 'q' is vulnerable"]);
    expect(row.effectiveVerification?.legacy).toBe(false);

    expect(row.aiNotes).toBeDefined();
    expect(row.aiNotes?.explanation).toBe("AI explains SQL injection");
    expect(row.aiNotes?.impact).toBe("AI details impact");
  });

  it("tolerates absent effective_verification and ai_notes from older API", () => {
    const older: ApiFinding = {
      ...sampleApiFinding,
      effective_verification: undefined,
      ai_notes: undefined,
    };
    const row = apiFindingRow(older);
    expect(row.effectiveVerification).toBeUndefined();
    expect(row.aiNotes).toBeUndefined();
    expect(row.title).toBe("SQL Injection");
  });
});

describe("report validation line and badges", () => {
  const baseFinding: Finding = {
    id: "F-001",
    title: "SQL Injection",
    severity: "HIGH",
    path: "/search",
    validation: "UNCONFIRMED",
    description: "desc",
    affected_url: "https://target.local",
    impact: "imp",
    remediation: "rem",
    tool: "sqlmap",
    references: [],
    evidence: [],
    evidence_unmasked: [],
    evidence_summary: "",
    cvss_score: 8.5,
    cvss_vector: "",
    category: "",
    cwe: [],
    owasp: [],
    cve: [],
    status: "open",
    severity_override: "",
    effective_severity: "",
    triage_note: "",
  };

  it("renders verified status with tool and proof line", () => {
    const f: Finding = {
      ...baseFinding,
      effective_verification: {
        status: "VERIFIED",
        verifier: "SQLMAP",
        proof_lines: ["parameter 'q' is injectable"],
        legacy: false,
      },
    };
    expect(validationLine(f)).toBe("✓ Verified by SQLMAP: parameter 'q' is injectable");
    expect(evidenceValidation(f)).toContain("Verified by SQLMAP");
  });

  it("renders not reproduced status", () => {
    const f: Finding = {
      ...baseFinding,
      effective_verification: {
        status: "NOT_REPRODUCED",
        verifier: "DALFOX",
        legacy: false,
      },
    };
    expect(validationLine(f)).toBe("Not reproduced by DALFOX");
    expect(evidenceValidation(f)).toContain("Not reproduced by DALFOX");
  });

  it("renders inconclusive status with reason", () => {
    const f: Finding = {
      ...baseFinding,
      effective_verification: {
        status: "INCONCLUSIVE",
        reason: "Connection timeout",
        legacy: false,
      },
    };
    expect(validationLine(f)).toBe("Inconclusive: Connection timeout");
    expect(evidenceValidation(f)).toContain("Inconclusive");
  });

  it("renders deferred status with reason", () => {
    const f: Finding = {
      ...baseFinding,
      effective_verification: {
        status: "DEFERRED",
        reason: "Run limit reached",
        legacy: false,
      },
    };
    expect(validationLine(f)).toBe("Deferred: Run limit reached");
    expect(evidenceValidation(f)).toContain("Deferred");
  });

  it("renders legacy, not verified when legacy is true", () => {
    const f: Finding = {
      ...baseFinding,
      validation: "CONFIRMED",
      effective_verification: {
        status: null,
        legacy: true,
      },
    };
    expect(validationLine(f)).toBe("legacy, not verified");
    expect(evidenceValidation(f)).toContain("legacy, not verified");
  });

  it("never treats validation_status CONFIRMED alone as confirmed in older API", () => {
    const f: Finding = {
      ...baseFinding,
      validation: "CONFIRMED",
      finding_category: "POTENTIAL_VULNERABILITY",
    };
    expect(validationLine(f)).toBe("legacy, not verified");
    expect(evidenceValidation(f)).toContain("legacy, not verified");
  });
});

describe("preferredProofLine", () => {
  it("picks non-marker protocol row when Start/Done markers are present", () => {
    const proofLines = [
      "Start 2026-11-06 02:12:15        -->> 127.0.0.1:8443 (127.0.0.1) <<--",
      "TLS 1      offered (deprecated)",
      "Done 2026-11-06 02:12:35        -->> 127.0.0.1:8443 (127.0.0.1) <<--",
    ];
    expect(preferredProofLine(proofLines)).toBe("TLS 1      offered (deprecated)");
  });

  it("falls back to the first line if all lines are markers or only one line", () => {
    expect(preferredProofLine(["Start only"])).toBe("Start only");
    expect(preferredProofLine(["Parameter: id (GET)"])).toBe("Parameter: id (GET)");
    expect(preferredProofLine([])).toBeUndefined();
    expect(preferredProofLine(undefined)).toBeUndefined();
  });
});

describe("H2 and M5 in FindingDetail and adapter", () => {
  const renderDetail = (finding: ReturnType<typeof apiFindingRow>) =>
    renderToStaticMarkup(
      createElement(FindingDetail, {
        finding,
        position: { index: 0, total: 1 },
        prev: null,
        next: null,
        onSelect: () => {},
      })
    );

  it("renders legacy, not verified for legacy confirmed-category row", () => {
    const row = apiFindingRow({
      ...sampleApiFinding,
      finding_category: "CONFIRMED_VULNERABILITY",
      validation_status: "CONFIRMED",
      verification_status: "CONFIRMED",
      effective_verification: {
        status: "VERIFIED",
        verifier: "TESTSSL",
        proof_lines: ["TLS 1 offered"],
        legacy: true,
      },
    });

    expect(row.confirmed).toBe(true); // category-based filter stays true
    const html = renderDetail(row);
    expect(html).toContain("legacy, not verified");
    expect(html).not.toContain("✓ Verified by");
  });

  it("renders legacy, not verified when projection is missing", () => {
    const row = apiFindingRow({
      ...sampleApiFinding,
      finding_category: "CONFIRMED_VULNERABILITY",
      validation_status: "CONFIRMED",
      verification_status: "CONFIRMED",
      effective_verification: undefined,
    });

    expect(row.confirmed).toBe(true); // category-based filter stays true
    const html = renderDetail(row);
    expect(html).toContain("legacy, not verified");
    expect(html).not.toContain("✓ Verified by");
  });

  it("renders legacy, not verified when status is null", () => {
    const row = apiFindingRow({
      ...sampleApiFinding,
      finding_category: "CONFIRMED_VULNERABILITY",
      validation_status: "CONFIRMED",
      verification_status: "CONFIRMED",
      effective_verification: {
        status: null,
        verifier: "TESTSSL",
        proof_lines: [],
        legacy: false,
      },
    });

    expect(row.confirmed).toBe(true); // category-based filter stays true
    const html = renderDetail(row);
    expect(html).toContain("legacy, not verified");
    expect(html).not.toContain("✓ Verified by");
  });

  it("renders protocol ROW line and prominent label for weak-cipher suites without claiming cipher verification", () => {
    const proofLines = [
      "Start 2026-11-06 02:12:15        -->> 127.0.0.1:8443 (127.0.0.1) <<--",
      "TLS 1      offered (deprecated)",
      "Done 2026-11-06 02:12:35        -->> 127.0.0.1:8443 (127.0.0.1) <<--",
    ];
    const subjectLabel = "TLS 1.0 accepted (protocol verified; cipher weakness not verified)";
    const row = apiFindingRow({
      ...sampleApiFinding,
      title: "Weak cipher suites",
      finding_category: "CONFIRMED_VULNERABILITY",
      validation_status: "CONFIRMED",
      verification_status: "VERIFIED",
      effective_verification: {
        status: "VERIFIED",
        kind: "TLS_WEAK_PROTOCOL",
        verifier: "TESTSSL",
        proof_lines: proofLines,
        subject: { label: subjectLabel },
        legacy: false,
      },
    });

    const html = renderDetail(row);
    // Shows protocol ROW proof line, not the Start marker
    expect(html).toContain("✓ Verified by TESTSSL: TLS 1      offered (deprecated)");
    expect(html).not.toContain("✓ Verified by TESTSSL: Start");
    // Shows backend scoped subject label prominently alongside verified line
    expect(html).toContain(subjectLabel);
    expect(html).toContain("cipher weakness not verified");
  });
});
