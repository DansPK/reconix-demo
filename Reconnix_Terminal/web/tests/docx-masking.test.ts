/* The Word reports print only what the mask left, wherever a value lands: a marker secret in every
   string of a saved run (findings, blocked requests, approvals and decisions, the scope, the
   target, the client, the timeline …) never reaches the single or the combined DOCX once the run
   is masked (lib/report/mask.ts, as both routes do), every case of redact-vectors.json is masked
   in each field a report prints, a private key split over evidence lines is caught as one block,
   and hostile text (WordprocessingML, a comment, control characters, a lone surrogate) stays text
   in a well-formed package. The unmasked control shows the markers would otherwise get through. */
import { describe, expect, it } from "vitest";

import type { Assessment } from "@/lib/data/schema";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { combineAssessments } from "@/lib/report/combined/select";
import { renderCombinedDocx } from "@/lib/report/docx/combined";
import { xmlText } from "@/lib/report/docx/ooxml";
import { renderReportDocx } from "@/lib/report/docx/report";
import { maskAssessment } from "@/lib/report/mask";

import { sampleAssessments } from "./fixtures";
import vectors from "./redact-vectors.json";
import { unzip } from "./unzip";
import { assertWellFormed } from "./xml";

const all = sampleAssessments();
const NOW = new Date("2026-10-21T08:00:00Z");
const ALL_ON = { ...DEFAULT_COMBINE_OPTIONS, evidence: true, low: true, appendix: true };

// enums, ids and times stay as they are (no pattern matches them, and the renderers key on them)
const KEEP = new Set(["uid", "status", "severity", "type", "decision", "request_id", "created_at", "saved_at", "started_at", "finished_at", "at", "schema"]);
const MARK = /leaf\d+secret/i;

/** `value` with every other string replaced by its own `token=LEAF<n>SECRET` (a value the mask hides). */
function markLeaves(value: unknown, c: { n: number }, key = ""): unknown {
  if (typeof value === "string") {
    if (KEEP.has(key)) return value;
    c.n += 1;
    return `token=LEAF${c.n}SECRET`;
  }
  if (Array.isArray(value)) return value.map((x) => markLeaves(x, c, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, markLeaves(x, c, k)]));
  return value;
}

/** Every part of the package, as one text. */
const docText = (bytes: Uint8Array) => [...unzip(bytes).values()].join("\n");
const single = (a: Assessment) => docText(renderReportDocx(a, NOW));
const combined = (...runs: Assessment[]) => docText(renderCombinedDocx(combineAssessments(runs, ALL_ON), NOW));

// a run with findings, a scope, approvals, decisions and a blocked request: every section prints
const base = all.find((a) => a.findings.length > 0 && a.scope && a.approvals.length && a.decisions.length && a.verdicts.some((v) => !v.allowed))!;

describe("a marker in every field", () => {
  const c = { n: 0 };
  const probe = { ...(markLeaves(base, c) as Assessment), status: "Stopped" as const };
  const other = markLeaves(all.find((a) => a !== base)!, c) as Assessment;

  it("has the sample run it needs", () => {
    expect(base).toBeDefined();
  });

  it("would reach both documents unmasked (the control)", () => {
    expect(single(probe)).toMatch(MARK);
    expect(combined(probe, other)).toMatch(MARK);
  });

  it("reaches neither once the runs are masked", () => {
    expect(single(maskAssessment(probe))).not.toMatch(MARK);
    expect(combined(maskAssessment(probe), maskAssessment(other))).not.toMatch(MARK);
  });
});

describe("every redact-vectors.json case", () => {
  const cases = (vectors as [string, string][]).filter(([raw, masked]) => raw !== masked);

  it.each(cases)("is masked in every field a report prints: %s", (raw) => {
    const a = structuredClone(base);
    a.findings[0] = { ...a.findings[0], title: raw, description: raw, evidence: [raw], affected_url: raw, triage_note: raw, impact: raw, remediation: raw, cvss_vector: raw };
    a.verdicts = [{ method: "GET", path: raw, allowed: false, reason: raw, at: null }];
    a.approvals = a.approvals.map((p) => ({ ...p, target: raw, action: raw, command: raw }));
    a.decisions = a.decisions.map((d) => ({ ...d, operator: raw, reason: raw }));
    a.scope = { ...a.scope!, tools: [raw], excluded_paths: [raw], allowed_actions: [raw], target_url: raw };
    a.target_url = raw;
    a.target = raw;
    a.client = raw;
    const m = maskAssessment(a);
    for (const out of [single(m), combined(m)]) expect(out).not.toContain(xmlText(raw));
  });
});

describe("a private key split over evidence lines", () => {
  it("is masked as one block in both documents", () => {
    const a = structuredClone(base);
    a.findings[0].evidence = ["-----BEGIN RSA PRIVATE KEY-----", "MIIBOgIBAAJBAKleafkeysecret", "-----END RSA PRIVATE KEY-----", "after"];
    const m = maskAssessment(a);
    expect(m.findings[0].evidence).toEqual(["•••• (private key)", "after"]);
    for (const out of [single(m), combined(m)]) {
      expect(out.toLowerCase()).not.toContain("leafkeysecret");
      expect(out).toContain("•••• (private key)");
    }
  });
});

describe("hostile text", () => {
  it("stays text: no field, comment or control character gets in, and every part stays well-formed", () => {
    const a = structuredClone(base);
    const evil = '</w:t></w:r><w:fldSimple w:instr="INCLUDEPICTURE &quot;http://x.invalid/a&quot;"/><w:r><w:t>]]><!--\u0000\u001b￾\uD800x';
    a.findings[0] = { ...a.findings[0], title: evil, description: evil, evidence: [evil, `\t${evil}\t`], cvss_vector: evil, triage_note: evil };
    a.verdicts = [{ method: evil, path: evil, allowed: false, reason: evil, at: null }];
    a.approvals = a.approvals.map((p) => ({ ...p, action: evil, target: evil }));
    a.decisions = a.decisions.map((d) => ({ ...d, operator: evil }));
    a.scope = { ...a.scope!, tools: [evil], excluded_paths: [evil] };
    a.assessment_id = evil;
    a.client = evil;
    for (const bytes of [renderReportDocx(a, NOW), renderCombinedDocx(combineAssessments([a], ALL_ON), NOW)]) {
      const parts = unzip(bytes);
      for (const [name, xml] of parts) expect(() => assertWellFormed(xml), name).not.toThrow();
      const out = [...parts.values()].join("\n");
      expect(out).not.toContain("<w:fldSimple");
      expect(out).not.toContain("<!--");
      expect(out).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/);
      expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(out).toContain("&lt;w:fldSimple"); // there, as text
    }
  });
});
