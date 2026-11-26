/* Every page counts the same findings. The review saw 41 on Findings and 40 on the Overview and
   the Reports with the sample data: the Findings list counted (and listed) a finding an analyst
   had marked as a false positive, which every other count leaves out. Now the list leaves false
   positives out unless they are shown (`?fp=1`), and its headline, chips and summary count what
   the Overview's strip, Findings by Severity, the Assessments rows and the assistant's findings
   card count. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { deriveDashboard, findingsSlice } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { runRow } from "@/components/dashboard/derive-report";
import { findingMatches, findingsHeadline, listable, parseFindingFilter, severityChips } from "@/components/dashboard/filters";
import { apiFindingRows } from "@/lib/api/adapt";
import { localAssessmentRows, localAssessments, localFindings, localOverview } from "@/lib/api/local";
import { findingsCard } from "@/lib/assistant/cards";
import { assessmentView } from "@/lib/data/adapt";
import { overview } from "@/lib/data/stats";

import { sampleAssessments } from "./fixtures";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined, signedIn: async () => true }));

const samples = sampleAssessments();
const views = samples.map(assessmentView);
const overall = deriveOverall(views);
const fileCount = samples.reduce((n, a) => n + a.findings.filter((f) => f.status !== "false-positive").length, 0);
const falsePositives = samples.reduce((n, a) => n + a.findings.filter((f) => f.status === "false-positive").length, 0);

/** What the Findings view counts and lists with the address's filters (findings-view.tsx). */
function findingsPage(rows: typeof overall.findings, query: { sev?: string; val?: string; q?: string; fp?: string } = {}) {
  const filter = parseFindingFilter({ sev: "", val: "", q: "", ...query });
  const counted = listable(rows, false);
  return {
    headline: findingsHeadline(counted.length, null, rows.length - counted.length),
    total: counted.length,
    listed: rows.filter((f) => findingMatches(f, filter)).length,
    chips: severityChips(listable(rows, filter.fp), []),
  };
}

describe("the findings total, page by page (sample data)", () => {
  it("holds a false positive, the case the review tripped on", () => {
    expect(falsePositives).toBeGreaterThan(0);
  });

  it("is the same number on Findings, the Overview, the Assessments and the assistant", () => {
    const page = findingsPage(overall.findings);
    expect(overall.findingTotal).toBe(fileCount);
    expect(overall.cards.summary.findings.total).toBe(fileCount);
    expect(overall.cards.findings.total).toBe(fileCount);
    expect(views.map(runRow).reduce((n, r) => n + r.findings, 0)).toBe(fileCount);
    expect(findingsCard(views).total).toBe(fileCount);
    expect(overview(samples).findings).toBe(fileCount);
    expect(page.total).toBe(fileCount);
    expect(page.listed).toBe(fileCount);
    expect(findingsHeadline(fileCount, overall.runs)).toMatch(new RegExp(`^${fileCount} findings across`));
  });

  it("gives each severity chip the Overview's count for that severity", () => {
    const page = findingsPage(overall.findings);
    for (const { level, count } of overall.cards.findings.severity) {
      expect(page.chips.find((c) => c.value === level)?.count ?? 0).toBe(count);
      expect(findingsPage(overall.findings, { sev: level }).listed).toBe(count);
    }
  });

  it("lists the false positives only when asked, still outside the total", () => {
    const shown = findingsPage(overall.findings, { fp: "1" });
    expect(shown.listed).toBe(fileCount + falsePositives);
    expect(shown.total).toBe(fileCount);
  });

  it("agrees per run too: the Findings list and the Overview's strip", () => {
    for (const v of views) {
      const d = deriveDashboard(v);
      const counted = d.findings.filter((f) => !f.falsePositive).length;
      expect(findingsPage(d.findings).total).toBe(counted);
      expect(d.cards.summary.findings.total).toBe(counted);
    }
  });
});

/* The Findings and Report views read the sample files through lib/api/local.ts, the Overview
   through deriveDashboard/deriveOverall: both roads must count the same findings. */
describe("the Core API answers made from the sample data", () => {
  beforeAll(() => vi.stubEnv("RECONIX_DATA_DIR", "tests/sample-data"));
  afterAll(() => vi.unstubAllEnvs());

  const counts = (s: ReturnType<typeof findingsSlice>) => ({ total: s.total, severity: s.severity, review: s.review, top: s.top.map((f) => [f.id, f.score]) });

  it("count every run as the Overview does", async () => {
    expect(counts(findingsSlice(apiFindingRows(await localFindings(null), await localAssessments()) as typeof overall.findings))).toEqual(counts(overall.cards.findings));
  });

  it("count each run as its Overview, its Assessments row and its report do", async () => {
    const listed = await localAssessments();
    const rows = await localAssessmentRows();
    for (const v of views) {
      const cards = deriveDashboard(v).cards.findings;
      const report = await localOverview(v.uid);
      expect(counts(findingsSlice(apiFindingRows(await localFindings(v.uid)) as typeof overall.findings)), v.uid).toEqual(counts(cards));
      expect(report.finding_count, v.uid).toBe(cards.total);
      for (const s of cards.severity) expect(report.findings_by_severity[s.level] ?? 0, `${v.uid} ${s.level}`).toBe(s.count);
      expect(listed.find((a) => a.assessment_id === v.uid)?.finding_count, v.uid).toBe(cards.total);
      expect(rows.find((a) => a.assessment_id === v.uid)?.finding_count, v.uid).toBe(cards.total);
    }
  });
});
