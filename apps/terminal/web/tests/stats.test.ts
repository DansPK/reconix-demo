/* The counts every page shows, checked against the sample data by independent arithmetic. */
import { describe, expect, it } from "vitest";

import {
  ATTENTION,
  allFindings,
  approvalRows,
  attentionItems,
  averageTestingMs,
  byTemplate,
  categoryCounts,
  cvssSummary,
  durationMs,
  effectiveSeverity,
  filterAssessments,
  idleInterrupted,
  isConfirmed,
  isLive,
  isOpen,
  labelTimeline,
  markIdle,
  needsReview,
  overview,
  perDay,
  severityCounts,
  topReferences,
  triageCounts,
  waitingApproval,
} from "@/lib/data/stats";
import { readFileSync } from "node:fs";
import path from "node:path";

import { AssessmentSchema, type TimelineEntry } from "@/lib/data/schema";

import { SAMPLE_DIR, sampleAssessments } from "./fixtures";

/* These counts check the arithmetic over untriaged findings: a false positive the sample data may
   hold is read as open here (the triage tests below add their own, and "a false positive" below
   checks one is left out of every count). */
const saved = sampleAssessments();
const list = saved.map((a) => ({ ...a, findings: a.findings.map((f) => (f.status === "false-positive" ? { ...f, status: "open" } : f)) }));
const findings = list.flatMap((a) => a.findings);

describe("overview", () => {
  const stats = overview(list);

  it("counts assessments, findings and policy checks", () => {
    expect(stats.assessments).toBe(list.length);
    expect(stats.findings).toBe(findings.length);
    expect(stats.confirmed + stats.review).toBe(findings.length);
    expect(stats.confirmed).toBe(findings.filter((f) => f.validation === "CONFIRMED").length);
    expect(stats.checks).toBe(list.reduce((n, a) => n + a.verdicts.length, 0));
    expect(stats.blocked).toBe(list.flatMap((a) => a.verdicts).filter((v) => !v.allowed).length);
    expect(stats.requests).toBe(list.reduce((n, a) => n + a.run.requests, 0));
  });

  it("counts approvals: decided ones plus the one a run waits on", () => {
    const decisions = list.flatMap((a) => a.decisions);
    expect(stats.granted).toBe(decisions.filter((d) => d.decision === "APPROVED").length);
    expect(stats.rejected).toBe(decisions.filter((d) => d.decision === "REJECTED").length);
    expect(stats.pending).toBe(list.filter((a) => a.status === "Awaiting input" && a.waiting_for.includes("approval")).length);
  });

  it("counts statuses", () => {
    expect(Object.values(stats.byStatus).reduce((a, b) => a + b, 0)).toBe(list.length);
  });
});

describe("approvals", () => {
  it("finds the approval a waiting run is stopped at", () => {
    const waiting = list.find((a) => a.status === "Awaiting input")!;
    const approval = waitingApproval(waiting)!;
    expect(waiting.waiting_for).toBe(`${approval.risk} approval for ${approval.action}`);
    expect(approvalRows([waiting]).find((r) => r.state === "PENDING")?.approval.request_id).toBe(approval.request_id);
  });

  it("leaves out requests the run never reached", () => {
    const stopped = list.find((a) => a.status === "Stopped")!;
    const rows = approvalRows([stopped]);
    expect(rows.every((r) => r.decision !== null)).toBe(true);
  });
});

describe("findings", () => {
  it("lists every finding once, most severe first, with a unique key", () => {
    const rows = allFindings(list);
    expect(rows).toHaveLength(findings.length);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    expect(rows.map((r) => order.indexOf(r.severity))).toEqual([...rows.map((r) => order.indexOf(r.severity))].sort((a, b) => a - b));
  });

  it("counts severities and references", () => {
    const counts = severityCounts(findings);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(findings.length);
    const top = topReferences(findings, 3);
    expect(top).toHaveLength(3);
    expect(top[0].count).toBeGreaterThanOrEqual(top[1].count);
    expect(top[0].count).toBe(findings.filter((f) => f.references.includes(top[0].ref)).length);
  });

  it("groups by template", () => {
    const groups = byTemplate(list);
    expect(groups.reduce((n, g) => n + g.findings, 0)).toBe(findings.length);
    expect(groups.reduce((n, g) => n + g.assessments, 0)).toBe(list.length);
  });
});

describe("time", () => {
  it("buckets findings per local day", () => {
    const days = perDay(list, 8, new Date(2026, 9, 5, 18));
    expect(days).toHaveLength(8);
    expect(days.reduce((n, d) => n + d.assessments, 0)).toBeLessThanOrEqual(list.length);
    expect(days.at(-1)!.day).toBe("2026-10-05");
  });

  it("measures testing time from scope approval", () => {
    const done = list.find((a) => a.status === "Completed")!;
    expect(durationMs(done)).toBe(Date.parse(done.run.finished_at!) - Date.parse(done.run.started_at!));
  });

  it("filters by text, template, status and age", () => {
    const now = Date.parse("2026-10-05T23:00:00Z");
    expect(filterAssessments(list, { q: "", template: "all", status: "all", range: "all" }, now)).toHaveLength(list.length);
    expect(filterAssessments(list, { q: "staging", template: "", status: "", range: "all" }, now).every((a) => a.target.includes("staging"))).toBe(true);
    expect(filterAssessments(list, { q: "", template: "API", status: "", range: "all" }, now).every((a) => a.template.name === "API")).toBe(true);
    expect(filterAssessments(list, { q: "", template: "", status: "Stopped", range: "all" }, now)).toHaveLength(list.filter((a) => a.status === "Stopped").length);
    const week = filterAssessments(list, { q: "", template: "", status: "", range: "7" }, now);
    expect(week.every((a) => now - Date.parse(a.created_at) <= 7 * 86_400_000)).toBe(true);
  });

  it("filters to the runs that need attention", () => {
    const shown = filterAssessments(list, { q: "", template: "", status: ATTENTION, range: "all" });
    expect(shown.map((a) => a.status).sort()).toEqual(list.map((a) => a.status).filter((x) => x === "Awaiting input" || x === "Stopped").sort());
  });
});

describe("attentionItems", () => {
  const run = (base: (typeof list)[number], uid: string, status: (typeof list)[number]["status"]) => ({ ...base, uid, status });
  const base = list[0];

  it("puts one of each kind first, then the rest", () => {
    const many = [
      run(base, "w1", "Awaiting input"),
      run(base, "w2", "Awaiting input"),
      run(base, "w3", "Awaiting input"),
      run(base, "s1", "Stopped"),
      run(base, "i1", "Interrupted"),
      run(base, "c1", "Completed"),
    ];
    const { items, runs } = attentionItems(many);
    const review = many.flatMap((a) => a.findings).filter((f) => f.validation !== "CONFIRMED").length;
    expect(runs).toBe(5);
    const order = items.map((i) => (i.kind === "review" ? "review" : i.assessment.uid));
    expect(order).toEqual(review ? ["w1", "review", "s1", "i1", "w2", "w3"] : ["w1", "s1", "i1", "w2", "w3"]);
  });

  it("counts the findings still for review", () => {
    const item = attentionItems(list).items.find((i) => i.kind === "review");
    const review = findings.filter((f) => f.validation !== "CONFIRMED");
    if (!review.length) expect(item).toBeUndefined();
    else expect(item).toMatchObject({ kind: "review", count: review.length });
  });

  it("is empty when nothing needs attention", () => {
    const calm = list.map((a) => ({ ...a, status: "Completed" as const, findings: a.findings.filter((f) => f.validation === "CONFIRMED") }));
    expect(attentionItems(calm)).toEqual({ items: [], runs: 0 });
  });
});

describe("interrupted runs", () => {
  it("reads a run the TUI quit during as interrupted, not waiting", () => {
    const waiting = list.find((a) => a.status === "Awaiting input")!;
    const raw = JSON.parse(readFileSync(path.join(SAMPLE_DIR, `${waiting.uid}.json`), "utf8"));
    const closed = AssessmentSchema.parse({ ...raw, session_closed: true });
    expect(closed.status).toBe("Interrupted");
    expect(closed.waiting_request_id).toBe("");
    expect(waitingApproval(closed)).toBeNull();
    expect(approvalRows([closed]).some((r) => r.state === "PENDING")).toBe(false);
  });

  it("keeps finished runs as they were", () => {
    const done = list.find((a) => a.status === "Completed")!;
    const raw = JSON.parse(readFileSync(path.join(SAMPLE_DIR, `${done.uid}.json`), "utf8"));
    expect(AssessmentSchema.parse({ ...raw, session_closed: true }).status).toBe("Completed");
  });
});

describe("timeline labels", () => {
  const entry = (type: "chat" | "activity", who: string, seq: number): TimelineEntry => ({
    seq, at: null, type, who, kind: "text", text: "", tone: "default", rows: [],
  });

  it("puts chat speakers and activity sources on one scale", () => {
    const labels = labelTimeline([
      entry("chat", "you", 1),
      entry("chat", "reconix", 2),
      entry("chat", "", 3), // continues the line above
      entry("activity", "USER", 4),
      entry("activity", "TOOL", 5),
      entry("chat", "policy", 6),
    ]).map((r) => r.who);
    expect(labels).toEqual(["YOU", "AI", "AI", "YOU", "TOOL", "POLICY"]);
  });
});

describe("weakness categories and CVSS", () => {
  it("categoryCounts partitions every finding, most common first", () => {
    const cats = categoryCounts(findings);
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(findings.length);
    for (let i = 1; i < cats.length; i += 1) expect(cats[i - 1].count).toBeGreaterThanOrEqual(cats[i].count);
  });

  it("cvssSummary counts only findings that carry a score", () => {
    const scored = findings.filter((f) => f.cvss_score > 0);
    const summary = cvssSummary(findings);
    expect(summary.scored).toBe(scored.length);
    if (scored.length) {
      expect(summary.max).toBe(Math.max(...scored.map((f) => f.cvss_score)));
    } else {
      expect(summary).toEqual({ max: 0, avg: 0, scored: 0 });
    }
  });
});

describe("analyst triage", () => {
  // the sample findings with three of them triaged: a false positive, a fixed and an accepted one
  const [fp, fixed, accepted] = findings;
  const triaged = list.map((a) => ({
    ...a,
    findings: a.findings.map((f) =>
      f === fp ? { ...f, status: "false-positive" } : f === fixed ? { ...f, status: "fixed" } : f === accepted ? { ...f, status: "accepted" } : f,
    ),
  }));
  const all = triaged.flatMap((a) => a.findings);

  it("uses the analyst's severity when one is set", () => {
    const f = findings.find((x) => x.severity !== "CRITICAL")!;
    expect(effectiveSeverity({ ...f, effective_severity: "CRITICAL" })).toBe("CRITICAL");
    expect(effectiveSeverity({ ...f, effective_severity: "", severity_override: "CRITICAL" })).toBe("CRITICAL");
    expect(effectiveSeverity({ ...f, effective_severity: "", severity_override: "" })).toBe(f.severity); // older files
    // anything else the file says is read as unset, and an INFO drops the finding
    // (tests/info-dropped.test.ts)
  });

  it("sorts and counts by the analyst's severity", () => {
    const low = findings.find((x) => x.severity === "LOW")!;
    const raised = list.map((a) => ({ ...a, findings: a.findings.map((f) => (f === low ? { ...f, effective_severity: "CRITICAL" as const } : f)) }));
    const criticals = severityCounts(findings).CRITICAL + 1;
    expect(allFindings(raised).slice(0, criticals).map((f) => f.id)).toContain(low.id); // among the critical ones first
    expect(allFindings(raised)[criticals].severity).not.toBe("CRITICAL");
    expect(severityCounts(raised.flatMap((a) => a.findings)).CRITICAL).toBe(criticals);
  });

  it("counts triage statuses; unknown ones count as open", () => {
    expect(triageCounts(all)).toEqual({ open: findings.length - 3, fixed: 1, accepted: 1, falsePositive: 1 });
    expect(isOpen({ ...fp, status: "in-progress" })).toBe(true);
  });

  it("leaves triaged findings out of review", () => {
    expect(needsReview({ ...fp, validation: "UNCONFIRMED", status: "fixed" })).toBe(false);
    expect(needsReview({ ...fp, validation: "UNCONFIRMED", status: "open" })).toBe(true);
    expect(needsReview({ ...fp, validation: "CONFIRMED", status: "open" })).toBe(false);
  });

  it("overview: false positives left out, review and CVSS from open findings", () => {
    const stats = overview(triaged);
    const open = all.filter(isOpen);
    expect(stats.findings).toBe(findings.length - 1);
    expect(stats.confirmed).toBe(all.filter((f) => f.status !== "false-positive" && isConfirmed(f)).length);
    expect(stats.open).toBe(findings.length - 3);
    expect(stats.review).toBe(open.filter((f) => !isConfirmed(f)).length);
    expect(stats.cvss).toEqual(cvssSummary(open));
  });

  it("per day and per template leave false positives out", () => {
    const today = new Date(2026, 9, 5, 18);
    const sum = (rows: { findings: number }[]) => rows.reduce((n, r) => n + r.findings, 0);
    expect(sum(byTemplate(triaged))).toBe(findings.length - 1);
    expect(sum(perDay(triaged, 30, today))).toBe(sum(perDay(list, 30, today)) - 1);
  });

  it("needs attention counts the findings still for review", () => {
    const review = attentionItems(triaged).items.find((i) => i.kind === "review");
    expect(review && review.kind === "review" && review.count).toBe(all.filter(needsReview).length);
  });
});

describe("stale runs", () => {
  const HOURS_12 = 12 * 3_600_000;
  const waiting = list.find((a) => a.status === "Awaiting input")!;
  const saved = Date.parse(waiting.saved_at);

  it("keeps a run that saved within the limit", () => {
    expect(markIdle(waiting, saved + HOURS_12, HOURS_12)).toBe(waiting);
  });

  it("reads a run that went quiet as interrupted, with nothing left pending", () => {
    const idle = markIdle(waiting, saved + HOURS_12 + 1, HOURS_12);
    expect(idle.status).toBe("Interrupted");
    expect([idle.waiting_gate, idle.waiting_request_id, idle.waiting_for]).toEqual(["", "", ""]);
    expect(waitingApproval(idle)).toBeNull();
    expect(approvalRows([idle]).some((r) => r.state === "PENDING")).toBe(false);
    expect(idleInterrupted(idle)).toBe(true);
    expect(isLive(idle)).toBe(false);
  });

  it("leaves finished, closed and undated runs alone, and can be turned off", () => {
    const later = saved + 30 * HOURS_12;
    for (const done of list.filter((a) => a.status === "Completed" || a.status === "Stopped")) {
      expect(markIdle(done, later, HOURS_12)).toBe(done);
    }
    const closed = { ...waiting, session_closed: true };
    expect(markIdle(closed, later, HOURS_12)).toBe(closed);
    const undated = { ...waiting, saved_at: "not a date" };
    expect(markIdle(undated, later, HOURS_12)).toBe(undated);
    expect(markIdle(waiting, later, 0)).toBe(waiting);
  });

  it("tells a quiet run from one the TUI quit during", () => {
    expect(idleInterrupted({ ...waiting, status: "Interrupted", session_closed: true })).toBe(false);
    expect(list.filter(isLive).every((a) => a.status === "Running" || a.status === "Awaiting input")).toBe(true);
  });
});

describe("average testing time", () => {
  it("averages the completed runs only", () => {
    const done = list.filter((a) => a.status === "Completed").map(durationMs) as number[];
    expect(averageTestingMs(list)).toBe(done.reduce((a, b) => a + b, 0) / done.length);
    expect(averageTestingMs(list.filter((a) => a.status !== "Completed"))).toBeNull();
  });
});

describe("a false positive", () => {
  it("is kept with its note, and left out of every count", () => {
    // a sample run with one of its findings marked as a false positive, as the TUI's triage saves it
    const run = list.find((a) => a.findings.length > 1)!;
    const marked = { ...run, findings: run.findings.map((f, i) => (i === 0 ? { ...f, status: "false-positive", triage_note: "Not reachable from outside." } : f)) };
    const all = marked.findings;
    const fps = all.filter((f) => f.status === "false-positive");
    expect(fps).toHaveLength(1);
    expect(fps[0].triage_note).not.toBe("");
    expect(overview([marked]).findings).toBe(all.length - 1);
    expect(triageCounts(all).falsePositive).toBe(1);
  });
});
