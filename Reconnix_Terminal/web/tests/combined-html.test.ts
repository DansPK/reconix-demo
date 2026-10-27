/* The combined report's HTML (lib/report/combined/html.ts): its ten sections, the anchors,
   every run and finding, escaping, no scripts, its own meta CSP — and that the single report,
   whose helpers it shares, still matches its saved copy (regenerated deliberately twice: when the
   meta CSP was added to it, and when the chip wash became a --chip-wash variable; otherwise
   byte-identical to the pre-refactor copy). */
import { describe, expect, it } from "vitest";

import type { Assessment } from "@/lib/data/schema";
import { renderCombinedHtml } from "@/lib/report/combined/html";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { combineAssessments } from "@/lib/report/combined/select";
import { esc, escPre, renderReportHtml } from "@/lib/report/html";
import { maskAssessment } from "@/lib/report/mask";

import { sampleAssessments } from "./fixtures";
import vectors from "./redact-vectors.json";

const all = sampleAssessments();
const picked = all.slice(0, 3);
const report = combineAssessments(picked, DEFAULT_COMBINE_OPTIONS);
const html = renderCombinedHtml(report, new Date("2026-10-20T09:00:00Z"));

const SECTIONS = [
  "Table of contents",
  "Executive summary",
  "Assessment overview",
  "Combined findings summary",
  "Individual assessment sections",
  "Evidence &amp; technical details",
  "Risk &amp; remediation priorities",
  "Limitations",
  "Appendix &amp; references",
];

describe("the combined HTML report", () => {
  it("is one document with the cover and nine more sections, each with its anchor", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<h1>Combined security assessment report</h1>");
    for (const name of SECTIONS) expect(html).toContain(`<h2>${name}</h2>`);
    for (const id of ["cover", "contents", "summary", "overview", "findings", "runs", "evidence", "priorities", "limitations", "appendix"]) {
      expect(html).toContain(`<section class="sheet" id="${id}">`);
      if (id !== "cover") expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain("Generated 2026-10-20");
    expect(html).toContain("break-before:page");
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`);
  });

  it("claims approval only when every run's scope was approved", () => {
    expect(html).toContain("Every run tested inside a scope the operator approved");
    const draft = { ...picked[0], scope: { ...picked[0].scope!, status: "DRAFT" } };
    const out = renderCombinedHtml(combineAssessments([draft, picked[1]], DEFAULT_COMBINE_OPTIONS));
    expect(out).not.toContain("Every run tested inside a scope the operator approved");
    expect(out).toContain("1 of the runs had no approved scope: see Limitations.");
    expect(out).toContain("combined <b>2 assessments</b>");
  });

  it("says when a completed run recorded no findings", () => {
    const out = renderCombinedHtml(combineAssessments([{ ...picked[0], findings: [] }], DEFAULT_COMBINE_OPTIONS));
    expect(out).toContain("This run completed and recorded no findings.");
    expect(out).toContain("Every run completed inside an approved scope; nothing was left out.");
  });

  it("names every run, its uid and every included finding", () => {
    for (const a of picked) {
      expect(html).toContain(esc(a.uid));
      expect(html).toContain(`id="run-${a.uid}"`);
      for (const f of a.findings) if (f.status !== "false-positive") expect(html).toContain(esc(f.title));
    }
    expect(html).toContain(`${report.summary.unique} unique finding`);
    expect(html).toContain(`${report.summary.occurrences} occurrences`);
  });

  it("shows masked evidence only when the option is on", () => {
    const line = picked.flatMap((a) => a.findings).find((f) => f.evidence.length)!.evidence[0];
    expect(html).toContain(esc(line.trim().split(/\s+/)[0]));
    const without = renderCombinedHtml(combineAssessments(picked, { ...DEFAULT_COMBINE_OPTIONS, evidence: false }));
    expect(without).not.toContain('<pre class="evidence">');
    expect(without).toContain("Evidence lines were left out");
  });

  it("carries no scripts and escapes markup in saved text", () => {
    expect(html).not.toContain("<script");
    // the HTML is only the PDF's source and the preview: no print toolbar or "save as PDF" hint
    expect(html).not.toMatch(/toolbar|Ctrl\+P|save as PDF/i);
    const hostile = { ...picked[0], findings: [{ ...picked[0].findings[0], title: '<img src=x onerror="alert(1)">', evidence: ["<b>raw</b>"] }] };
    const out = renderCombinedHtml(combineAssessments([hostile], DEFAULT_COMBINE_OPTIONS));
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>raw</b>");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("says when the appendix was left out", () => {
    const out = renderCombinedHtml(combineAssessments(picked, { ...DEFAULT_COMBINE_OPTIONS, appendix: false }));
    expect(out).toContain("The appendix was left out");
    expect(out).not.toContain("Saved copies");
  });
});

// --- masking at the boundary: every string leaf of a saved run carries its own secret -------------
// The routes mask an assessment once more (lib/report/mask.ts) before a report is built from it.
// The probe marks every string leaf of a fixture with a distinct secret the TUI's patterns catch
// (`token=LEAF<n>SECRET`), except the leaves a report uses as keys (uids, enums, timestamps,
// request ids), renders both reports from the masked copy and looks for any marker that survived,
// case-insensitively (some fields go through title()).

const withFinding = (a: Assessment, patch: Partial<Assessment["findings"][number]>): Assessment => ({
  ...a,
  findings: [{ ...a.findings[0], ...patch }, ...a.findings.slice(1)],
});

const KEYS = new Set(["uid", "status", "severity", "type", "decision", "request_id", "created_at", "saved_at", "started_at", "finished_at", "at"]);
const MARK = /leaf\d+secret/i;

function markLeaves(value: unknown, count: { n: number }, key = ""): unknown {
  if (typeof value === "string") {
    if (KEYS.has(key)) return value;
    count.n += 1;
    return `token=LEAF${count.n}SECRET`;
  }
  if (Array.isArray(value)) return value.map((v) => markLeaves(v, count, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, markLeaves(v, count, k)]));
  return value;
}

describe("masking at the report boundary", () => {
  const base = all.find((a) => a.findings.length > 0 && a.scope && a.approvals.length && a.decisions.length)!;
  const count = { n: 0 };
  // Stopped, so the combined report prints the run's stopped_reason under Limitations
  const probe = { ...(markLeaves(base, count) as Assessment), status: "Stopped" as const };
  const other = markLeaves(picked[1], count) as Assessment;

  it("marks every free-text leaf, and the unmasked reports would print them", () => {
    expect(count.n).toBeGreaterThan(50);
    expect(renderReportHtml(probe)).toMatch(MARK);
    expect(renderCombinedHtml(combineAssessments([probe, other], DEFAULT_COMBINE_OPTIONS))).toMatch(MARK);
  });

  it("lets no marker through the single report", () => {
    expect(renderReportHtml(maskAssessment(probe))).not.toMatch(MARK);
  });

  it("lets no marker through the combined report", () => {
    const out = renderCombinedHtml(combineAssessments([maskAssessment(probe), maskAssessment(other)], DEFAULT_COMBINE_OPTIONS));
    expect(out).not.toMatch(MARK);
  });

  it("masks every vector of redact-vectors.json wherever it lands", () => {
    for (const [raw, masked] of vectors as [string, string][]) {
      if (raw === masked) continue;
      const a = maskAssessment(withFinding(base, { description: raw, evidence: [raw], affected_url: raw, triage_note: raw }));
      const out = renderReportHtml(a);
      expect(out, raw).not.toContain(esc(raw));
      expect(out, raw).not.toContain(escPre(raw));
      expect(out.includes(esc(masked)) || out.includes(escPre(masked)), `${raw.slice(0, 30)}: the masked text is missing`).toBe(true);
    }
  });

  it("catches a private key spread over several evidence lines", () => {
    const spread = ["-----BEGIN RSA PRIVATE KEY-----", "MIIBOgIBAAJBAKleafkeysecret", "-----END RSA PRIVATE KEY-----"];
    const a = maskAssessment(withFinding(base, { evidence: spread }));
    expect(a.findings[0].evidence.join("\n")).not.toContain("leafkeysecret");
    expect(renderReportHtml(a).toLowerCase()).not.toContain("leafkeysecret");
  });

  it("leaves a plain question alone", () => {
    const [plain] = (vectors as [string, string][]).filter(([raw, masked]) => raw === masked);
    const out = renderReportHtml(maskAssessment(withFinding(base, { description: plain[0] })));
    expect(out).toContain(esc(plain[0]));
  });
});

describe("the single report", () => {
  it("matches its saved copy, and carries the meta CSP", async () => {
    const a = all.find((x) => x.findings.length > 0 && x.scope)!;
    const out = renderReportHtml(a, new Date("2026-10-05T12:00:00Z"));
    expect(out).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`);
    await expect(out).toMatchFileSnapshot("./__snapshots__/single-report.html");
  });

  it("never lets a triage status named like an Object built-in pick a class", () => {
    const a = all.find((x) => x.findings.length > 0)!;
    const out = renderReportHtml({ ...a, findings: [{ ...a.findings[0], status: "constructor", severity: "HIGH", validation: "toString" }] });
    expect(out).toContain('<span class="st open">constructor</span>');
    expect(out).toContain('<span class="val inconclusive">tostring</span>');
    expect(out).not.toContain("function Object");
  });
});
