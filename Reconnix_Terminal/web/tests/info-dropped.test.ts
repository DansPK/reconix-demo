/* Info is dropped: a saved file from an older TUI that holds informational findings (INFO as the
   detected, overridden or effective severity) still loads, and those findings appear nowhere: no
   list, count, chart, report, assistant card or model context. Nothing is remapped to Low. The
   fixture is built here (tests/fixtures.ts `rawWithInfo`), so the sample data needs none. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { overallReportCards, reportCards } from "@/components/dashboard/derive-report";
import { parseFindingFilter, severityChips } from "@/components/dashboard/filters";
import { findingsCard, pickCards } from "@/lib/assistant/cards";
import { buildContext } from "@/lib/assistant/context";
import { severityCounts as cardCounts } from "@/lib/assistant/insights";
import { welcomePrompts } from "@/lib/assistant/prompts";
import { assessmentView } from "@/lib/data/adapt";
import { AssessmentSchema, isInfoFinding, SAVED_SEVERITIES, SEVERITIES } from "@/lib/data/schema";
import { allFindings, attentionItems, effectiveSeverity, overview, severityCounts } from "@/lib/data/stats";
import { readAssessmentFile } from "@/lib/data/store";
import { combineAssessments } from "@/lib/report/combined/select";
import { renderCombinedHtml } from "@/lib/report/combined/html";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { renderCombinedDocx } from "@/lib/report/docx/combined";
import { renderReportDocx } from "@/lib/report/docx/report";
import { renderReportHtml } from "@/lib/report/html";
import { renderFile } from "@/lib/report/render";

import { INFO_MARK, rawWithInfo, sampleAssessments } from "./fixtures";
import { unzip } from "./unzip";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));

const NOW = new Date("2026-10-22T08:00:00Z");
const raw = rawWithInfo();
// the run's own findings, none of them informational
const kept = raw.findings.filter((f) => !String(f.title).includes(INFO_MARK) && ![f.severity, f.severity_override, f.effective_severity].includes("INFO"));
const a = AssessmentSchema.parse(raw);
const others = sampleAssessments().filter((x) => x.uid !== a.uid);
const library = [a, ...others];
const v = assessmentView(a);
const views = library.map(assessmentView);
/** Nothing of an informational finding is in `text`. */
const clean = (text: string) => {
  expect(text).not.toContain(INFO_MARK);
  expect(text).not.toMatch(/INFO-\d/);
};

describe("an older saved file with informational findings", () => {
  it("still validates: INFO is accepted as saved, never part of the scale", () => {
    expect(kept.length, "the fixture needs a run with findings of its own").toBeGreaterThan(0);
    expect(SEVERITIES).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    expect(SAVED_SEVERITIES).toContain("INFO");
    expect(AssessmentSchema.safeParse(raw).success).toBe(true);
  });

  it("loads with every INFO finding dropped, whichever field says INFO, and the rest unchanged", () => {
    expect(raw.findings.filter((f) => String(f.title).includes(INFO_MARK))).toHaveLength(4);
    expect(a.findings.map((f) => f.id)).toEqual(kept.map((f) => f.id));
    for (const f of a.findings) {
      expect(SEVERITIES).toContain(f.severity);
      expect(["", ...SEVERITIES]).toContain(f.effective_severity);
      expect(["", ...SEVERITIES]).toContain(f.severity_override);
      expect(SEVERITIES).toContain(effectiveSeverity(f));
    }
    // dropped, not remapped: no finding moved to LOW
    expect(a.findings.filter((f) => f.severity === "LOW")).toHaveLength(kept.filter((f) => f.severity === "LOW").length);
  });

  it("is read by the store, not skipped as a foreign file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reconix-info-"));
    try {
      const name = `${raw.uid}.json`;
      writeFileSync(path.join(dir, name), JSON.stringify(raw));
      const read = await readAssessmentFile(dir, name);
      expect(read && "uid" in read ? read.findings.map((f) => f.id) : read).toEqual(kept.map((f) => f.id));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops an analyst's INFO, and reads any other unknown analyst severity as unset", () => {
    const base = raw.findings.find((f) => f.severity === "HIGH" || f.severity === "MEDIUM" || f.severity === "LOW")!;
    const one = (fields: Record<string, string>) => AssessmentSchema.parse({ ...raw, findings: [{ ...base, ...fields }] }).findings;
    expect(one({ severity_override: "INFO", effective_severity: "INFO" })).toEqual([]);
    expect(one({ severity_override: " Info ", effective_severity: "" })).toEqual([]);
    const [odd] = one({ severity_override: "SEVERE", effective_severity: "" });
    expect(odd).toMatchObject({ severity: base.severity, severity_override: "" });
    expect(effectiveSeverity(odd)).toBe(base.severity);
    expect(isInfoFinding({ severity: "LOW", severity_override: "", effective_severity: "info" })).toBe(true);
    expect(isInfoFinding({ severity: "LOW", severity_override: "", effective_severity: "" })).toBe(false);
  });
});

describe("the dropped findings appear nowhere", () => {
  it("in the lists: the run's findings, every run's, and the Findings filters", () => {
    expect(v.findings.map((f) => f.id)).toEqual(a.findings.map((f) => f.id.match(/^\d+$/) ? `F-${f.id}` : f.id));
    expect(allFindings(library).some((f) => f.title.includes(INFO_MARK))).toBe(false);
    const d = deriveDashboard(v);
    const all = deriveOverall(views);
    for (const rows of [d.findings, all.findings]) expect(rows.some((f) => f.title.includes(INFO_MARK))).toBe(false);
    expect(severityChips(all.findings, []).map((c) => c.value)).not.toContain("INFO");
    expect(severityChips(all.findings, ["INFO"]).map((c) => c.value)).not.toContain("INFO");
    expect(parseFindingFilter({ sev: "INFO,HIGH", val: "", q: "" }).sev).toEqual(["HIGH"]);
  });

  it("in the counts: four levels, and the strip, the card and the Findings view agree", () => {
    const real = a.findings.filter((f) => f.status !== "false-positive");
    expect(Object.keys(severityCounts(a.findings))).toEqual([...SEVERITIES]);
    expect(Object.values(severityCounts(a.findings)).reduce((n, c) => n + c, 0)).toBe(a.findings.length);
    expect(overview([a]).findings).toBe(real.length);
    const review = attentionItems([a]).items.find((i) => i.kind === "review");
    if (review?.kind === "review") expect(Object.keys(review.bySeverity)).toEqual([...SEVERITIES]);
    for (const d of [deriveDashboard(v), deriveOverall(views)]) {
      expect(d.cards.findings.severity.map((s) => s.level)).toEqual([...SEVERITIES]);
      expect(d.cards.findings.total).toBe(d.cards.summary.findings.total);
      expect(d.findingTotal).toBe(d.cards.findings.total);
      expect(d.cards.findings.top.some((t) => t.title.includes(INFO_MARK))).toBe(false); // CVSS 9.9 would top it
      expect(d.cards.findings.words).not.toMatch(/info/i);
    }
    expect(deriveDashboard(v).findingTotal).toBe(real.length);
  });

  it("in the Report view, for the run and for every run", () => {
    const d = deriveDashboard(v);
    const one = reportCards(v, d.findings, d.cards.findings);
    const all = overallReportCards(views, deriveOverall(views).cards.findings);
    for (const r of [one, all]) {
      clean(JSON.stringify(r));
      expect(Number(r.stats.find((s) => s.label === "Findings")!.value)).toBe(r.findings.total);
    }
  });

  it("in the single report: HTML (the PDF's source), Word and JSON", () => {
    const html = renderReportHtml(a, NOW);
    clean(html);
    const tiles = [...html.matchAll(/<div class="k">([^<]+)<\/div>/g)].map((m) => m[1]);
    expect(tiles).toEqual(["Critical", "High", "Medium", "Low", "Total"]);
    expect(html).not.toMatch(/class="(tile|find s-)info|<i class="info"/);
    const xml = unzip(renderReportDocx(a, NOW)).get("word/document.xml") ?? "";
    clean(xml);
    expect(xml).not.toMatch(/>Info</);
    const json = String(renderFile("json", a));
    clean(json);
    expect(json).not.toContain('"INFO"');
  });

  it("in the combined report: its model, preview and Word file", () => {
    const r = combineAssessments(library.slice(0, 3), DEFAULT_COMBINE_OPTIONS);
    clean(JSON.stringify(r));
    expect(Object.keys(r.summary.uniqueBySeverity)).toEqual([...SEVERITIES]);
    expect(Object.keys(r.summary.occurrencesBySeverity)).toEqual([...SEVERITIES]);
    clean(renderCombinedHtml(r, NOW));
    clean(unzip(renderCombinedDocx(r, NOW)).get("word/document.xml") ?? "");
  });

  it("for the AI Assistant: cards, counts, suggestions and the model's context", () => {
    const card = findingsCard(views);
    expect(Object.keys(card.counts)).toEqual([...SEVERITIES]);
    expect(Object.values(card.counts).reduce((n, c) => n + c, 0)).toBe(card.total);
    expect(Object.keys(cardCounts(views))).toEqual([...SEVERITIES]);
    for (const uid of [a.uid, null]) {
      clean(JSON.stringify(pickCards(library, uid, "Analyze the findings and explain the top finding")));
      clean(JSON.stringify(pickCards(library, uid, "Explain INFO-1")));
      const context = buildContext(library, uid)!;
      clean(context.text);
      expect(context.text).not.toMatch(/\d+ info\b/);
    }
    clean(JSON.stringify(welcomePrompts([v])));
    clean(JSON.stringify(welcomePrompts(views)));
  });
});
