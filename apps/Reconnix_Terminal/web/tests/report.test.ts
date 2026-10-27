/* The Report view's data (derive-report.ts), for one run and for every saved run, checked
   against the sample files: every count agrees with what the files hold and the policy tiles are
   gone. Its Findings tile counts every finding, like the Overview's strip, and its Findings by
   Severity card counts the same findings on the four levels it lists. */
import { describe, expect, it } from "vitest";

import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall } from "@/components/dashboard/derive-overall";
import { overallReportCards, REPORT_TOP_FINDINGS, reportCards, runRow, worstOf } from "@/components/dashboard/derive-report";
import { TARGETS_PER_PAGE, targetsPage, targetsPagePatch } from "@/components/dashboard/report-targets-paging";
import type { Stat } from "@/components/dashboard/stat-types";
import { REPORT_KEYS, runHref, VIEW_FILTERS, viewSearch } from "@/components/dashboard/view-url";
import { assessmentView } from "@/lib/data/adapt";
import type { Assessment } from "@/lib/data/schema";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments();
const views = samples.map(assessmentView);
const withFindings = samples.find((a) => a.findings.length > 1)!;
const stat = (stats: Stat[], label: string) => stats.find((s) => s.label === label)!;
const counted = (a: Assessment) => a.findings.filter((f) => f.status !== "false-positive" && f.validation !== "FALSE_POSITIVE");
const report = (a: Assessment) => {
  const v = assessmentView(a);
  const d = deriveDashboard(v);
  return reportCards(v, d.findings, d.cards.findings) as Extract<ReturnType<typeof reportCards>, { mode: "run" }>;
};

describe("one run's report", () => {
  it("has no policy tiles: findings, plan steps, requests and masked evidence", () => {
    const r = report(withFindings);
    expect(r.stats.map((s) => s.label)).toEqual(["Findings", "Plan steps", "Requests sent", "Masked evidence"]);
    expect(JSON.stringify(r.stats)).not.toMatch(/polic|blocked/i);
  });

  it("counts what the file holds", () => {
    const a = withFindings;
    const r = report(a);
    expect(stat(r.stats, "Findings").value).toBe(String(counted(a).length));
    expect(stat(r.stats, "Requests sent").value).toBe(String(a.run.requests));
    const done = a.plan.filter((p) => p.status === "done").length;
    expect(stat(r.stats, "Plan steps").value).toBe(`${done}/${a.plan.length}`);
    const masks = assessmentView(a).log.filter((l) => l.kind === "mask").length;
    expect(stat(r.stats, "Masked evidence").value).toBe(String(masks));
    expect(r.rows).toHaveLength(a.findings.length);
    expect(r.plan.map((p) => p.label)).toEqual(a.plan.map((p) => p.label));
    expect(r.uid).toBe(a.uid);
  });

  it("lists the worst findings first, each with its review state", () => {
    const r = report(withFindings);
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (let i = 1; i < r.rows.length; i++) expect(order.indexOf(r.rows[i - 1].severity)).toBeLessThanOrEqual(order.indexOf(r.rows[i].severity));
    expect(r.rows.every((f) => ["Confirmed", "Needs review", "Closed", "Fixed", "Accepted", "False positive"].includes(f.review.label))).toBe(true);
  });
});

describe("every run's report", () => {
  const overall = deriveOverall(views);
  const r = overallReportCards(views, overall.cards.findings) as Extract<ReturnType<typeof overallReportCards>, { mode: "all" }>;

  it("totals the runs, findings and requests", () => {
    expect(stat(r.stats, "Runs").value).toBe(String(samples.length));
    expect(stat(r.stats, "Findings").value).toBe(String(overall.findingTotal));
    expect(stat(r.stats, "Requests sent").value).toBe(String(samples.reduce((n, a) => n + a.run.requests, 0)));
    expect(JSON.stringify(r.stats)).not.toMatch(/polic|blocked/i);
  });

  it("has one row per run, newest first, with its findings and worst severity", () => {
    expect(r.runs.map((x) => x.uid)).toEqual(views.map((v) => v.uid));
    for (const row of r.runs) {
      const a = samples.find((x) => x.uid === row.uid)!;
      const v = assessmentView(a);
      const kept = v.findings.filter((f) => !f.falsePositive);
      expect(row.findings).toBe(kept.length);
      expect(row.worst).toBe(worstOf(kept.map((f) => f.severity)));
    }
  });

  it("counts the same findings in the Findings tile and on the Findings by Severity card", () => {
    const real = views.flatMap((v) => v.findings).filter((f) => !f.falsePositive).length;
    expect(r.findings.severity.map((s) => s.level)).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    expect(Number(stat(r.stats, "Findings").value)).toBe(r.findings.total);
    expect(r.findings.total).toBe(real);
  });

  it("sums the targets' findings to the total", () => {
    expect(r.targets.reduce((n, t) => n + t.findings, 0)).toBe(overall.findingTotal);
    expect(r.targets.reduce((n, t) => n + t.runs, 0)).toBe(samples.length);
  });

  it("names the worst severity, or none", () => {
    expect(worstOf(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(worstOf([])).toBeNull();
  });
});

// The Report view's Findings by Severity lists the top 3 CVSS findings, in one run and every
// run alike; the Overview's card keeps its longer list (derive.ts, as many as its height allows).
describe("the Report's top CVSS findings", () => {
  const topOf = (a: Assessment) => deriveDashboard(assessmentView(a)).cards.findings.top;
  // the run with the most findings, every one of them scored (no sample run scores more than 3)
  const biggest = samples.reduce((a, b) => (b.findings.length > a.findings.length ? b : a));
  const many: Assessment = { ...biggest, findings: biggest.findings.map((f, i) => ({ ...f, cvss_score: 9.5 - i * 0.5 })) };

  it("are cut at 3, the highest scores first, the same as the Overview's first three", () => {
    expect(REPORT_TOP_FINDINGS).toBe(3);
    const overview = topOf(many);
    const r = report(many);
    expect(overview.length).toBeGreaterThan(REPORT_TOP_FINDINGS); // the Overview keeps more
    expect(r.findings.top).toEqual(overview.slice(0, REPORT_TOP_FINDINGS));
    const scores = r.findings.top.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("are cut at 3 for every run too, and the rest of the card is the Overview's", () => {
    const overall = deriveOverall(views);
    const r = overallReportCards(views, overall.cards.findings);
    expect(overall.cards.findings.top.length).toBeGreaterThan(REPORT_TOP_FINDINGS);
    expect(r.findings.top).toEqual(overall.cards.findings.top.slice(0, REPORT_TOP_FINDINGS));
    expect({ ...r.findings, top: [] }).toEqual({ ...overall.cards.findings, top: [] });
  });

  it("leave a shorter list alone: no report has more than 3", () => {
    for (const a of samples) expect(report(a).findings.top.length).toBe(Math.min(REPORT_TOP_FINDINGS, topOf(a).length));
  });
});

// The every-run Report's Targets card: 7 targets a page, the page in the address as `tpage`.
describe("the Report's targets, 7 a page", () => {
  const overall = deriveOverall(views);
  const r = overallReportCards(views, overall.cards.findings) as Extract<ReturnType<typeof overallReportCards>, { mode: "all" }>;
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("shows 7 a page and keeps room for a whole page on every page", () => {
    expect(TARGETS_PER_PAGE).toBe(7);
    const n = r.targets.length;
    expect(n, "the sample data has more than a page of targets").toBeGreaterThan(TARGETS_PER_PAGE);
    const pages = Math.ceil(n / TARGETS_PER_PAGE);
    const first = targetsPage(r.targets, "");
    expect(first.paging).toMatchObject({ page: 1, pages, start: 0, end: TARGETS_PER_PAGE, total: n });
    expect(first.rows).toEqual(r.targets.slice(0, TARGETS_PER_PAGE));
    expect(first.paging.label).toBe(`Page 1 of ${pages} · ${n} results`);
    const last = targetsPage(r.targets, String(pages));
    expect(last.rows).toEqual(r.targets.slice((pages - 1) * TARGETS_PER_PAGE));
    expect([first.slots, last.slots]).toEqual([TARGETS_PER_PAGE, TARGETS_PER_PAGE]); // a short last page keeps the room
    // every target on exactly one page
    const all = Array.from({ length: pages }, (_, i) => targetsPage(r.targets, String(i + 1)).rows).flat();
    expect(all).toEqual(r.targets);
  });

  it("counts its pages, and keeps room only for the rows there are within one page", () => {
    expect(targetsPage(rows(7), "").paging.pages).toBe(1);
    expect(targetsPage(rows(8), "").paging.pages).toBe(2);
    expect(targetsPage(rows(11), "2")).toMatchObject({ rows: [7, 8, 9, 10], slots: 7, paging: { page: 2, pages: 2, label: "Page 2 of 2 · 11 results" } });
    expect(targetsPage(rows(14), "").paging.pages).toBe(2);
    expect(targetsPage(rows(15), "3").rows).toEqual([14]);
    expect(targetsPage(rows(3), "")).toMatchObject({ rows: [0, 1, 2], slots: 3, paging: { pages: 1, label: "3 results" } });
    expect(targetsPage(rows(1), "").slots).toBe(1);
  });

  it("reads tpage from the address, clamped to a page that exists", () => {
    const page = (raw: string | null | undefined) => targetsPage(rows(11), raw).paging.page;
    expect(page(undefined)).toBe(1);
    expect(page(null)).toBe(1);
    expect(page("")).toBe(1);
    expect(page("zzz")).toBe(1);
    expect(page("0")).toBe(1);
    expect(page("-3")).toBe(1);
    expect(page("2")).toBe(2);
    expect(page("2.9")).toBe(2);
    expect(page("99")).toBe(2);
    expect(targetsPagePatch(1)).toEqual({ tpage: "" }); // the first page is the plain address
    expect(targetsPagePatch(2)).toEqual({ tpage: "2" });
  });

  it("is the Report view's own address key: dropped on leaving the view or switching runs", () => {
    expect(REPORT_KEYS).toEqual(["tpage"]);
    expect(VIEW_FILTERS.reports).toBe(REPORT_KEYS);
    const params = (s: string) => Object.fromEntries(new URLSearchParams(s));
    expect(params(viewSearch("view=reports&tpage=2", "reports"))).toEqual({ view: "reports", tpage: "2" });
    expect(params(viewSearch("view=reports&tpage=2", "findings"))).toEqual({ view: "findings" });
    expect(params(viewSearch("view=findings&page=2", "reports"))).toEqual({ view: "reports" });
    expect(runHref("view=reports&tpage=2", "run-1")).toBe("/?view=reports&uid=run-1");
  });
});

describe("the runs table's RUN column", () => {
  it("always names the run: its id, else its label, else its uid", () => {
    const a = samples[0];
    expect(runRow(assessmentView(a)).id).toBe(a.assessment_id || a.label);
    expect(runRow(assessmentView({ ...a, assessment_id: "", label: "Lab run" })).id).toBe("Lab run");
    expect(runRow(assessmentView({ ...a, assessment_id: "", label: "" })).id).toBe(a.uid);
  });
});
