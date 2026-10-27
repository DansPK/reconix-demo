/* Every page counts the same findings. The review saw 41 on Findings and 40 on the Overview and
   the Reports with the sample data: the Findings list counted (and listed) a finding an analyst
   had marked as a false positive, which every other count leaves out. Now the list leaves false
   positives out unless they are shown (`?fp=1`), and its headline, chips and summary count what
   the Overview's strip, Findings by Severity, the Report view, the Assessments rows and the
   assistant's findings card count. */
import { describe, expect, it } from "vitest";

import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { overallReportCards, reportCards, reportFindingsMeta, runRow } from "@/components/dashboard/derive-report";
import { findingMatches, findingsHeadline, listable, parseFindingFilter, severityChips } from "@/components/dashboard/filters";
import type { Stat } from "@/components/dashboard/stat-types";
import { findingsCard } from "@/lib/assistant/cards";
import { assessmentView } from "@/lib/data/adapt";
import { overview } from "@/lib/data/stats";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments();
const views = samples.map(assessmentView);
const overall = deriveOverall(views);
const stat = (stats: Stat[], label: string) => stats.find((s) => s.label === label)!;
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

  it("is the same number on Findings, the Overview, the Reports, the Assessments and the assistant", () => {
    const report = overallReportCards(views, overall.cards.findings);
    const page = findingsPage(overall.findings);
    expect(overall.findingTotal).toBe(fileCount);
    expect(overall.cards.summary.findings.total).toBe(fileCount);
    expect(overall.cards.findings.total).toBe(fileCount);
    expect(stat(report.stats, "Findings").value).toBe(String(fileCount));
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

  it("agrees per run too: the Findings list, the report's strip and its findings table", () => {
    for (const v of views) {
      const d = deriveDashboard(v);
      const r = reportCards(v, d.findings, d.cards.findings);
      if (r.mode !== "run") throw new Error("one run");
      const counted = d.findings.filter((f) => !f.falsePositive).length;
      expect(findingsPage(d.findings).total).toBe(counted);
      expect(stat(r.stats, "Findings").value).toBe(String(counted));
      expect(d.cards.summary.findings.total).toBe(counted);
      expect(reportFindingsMeta(r.rows)).toMatch(new RegExp(`^${counted} findings?\\b`));
    }
  });

  it("names the false positives beside the report table's count, never in it", () => {
    expect(reportFindingsMeta([{ falsePositive: false }, { falsePositive: true }])).toBe("1 finding + 1 false positive");
    expect(reportFindingsMeta([{ falsePositive: false }, { falsePositive: false }])).toBe("2 findings");
    expect(reportFindingsMeta([])).toBe("0 findings");
  });
});
