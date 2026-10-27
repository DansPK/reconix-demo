/* The Assessments view's filters and counts (components/dashboard/assessments-filters.ts) on the
   sample runs, and the rows it lists (derive-report.ts runRow) paged ten at a time. */
import { describe, expect, it } from "vitest";

import { ASSESSMENT_KEYS, filterRuns, parseRunFilter, RUN_STATUS_ORDER, runFilterActive, runFilterMatches, statusCounts, templateCounts } from "@/components/dashboard/assessments-filters";
import { runRow } from "@/components/dashboard/derive-report";
import { runOverviewHref, VIEW_FILTERS } from "@/components/dashboard/view-url";
import { assessmentView } from "@/lib/data/adapt";
import { paginate, PER_PAGE, slicePage } from "@/lib/paging";
import { RUN_STATUS } from "@/lib/status";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.uid.localeCompare(a.uid)); // as store.ts orders them
const rows = samples.map((a) => runRow(assessmentView(a)));
const none = { q: "", status: "", template: "" };

describe("parseRunFilter", () => {
  it("keeps only statuses the dashboard knows and templates some run used", () => {
    const f = parseRunFilter({ q: " api ", status: "Completed,Failed,<script>,constructor,__proto__,Stopped", template: "API,Nope" }, rows);
    expect(f).toEqual({ q: " api ", status: ["Completed", "Stopped"], template: ["API"] });
    expect(runFilterActive(f)).toBe(true);
  });
  it("is off with nothing in the address, or only blanks", () => {
    expect(runFilterActive(parseRunFilter(none, rows))).toBe(false);
    expect(runFilterActive(parseRunFilter({ q: "   ", status: ",", template: "" }, rows))).toBe(false);
  });
});

describe("filterRuns", () => {
  it("keeps every run with no filter, newest first", () => {
    const kept = filterRuns(rows, parseRunFilter(none, rows));
    expect(kept.map((r) => r.uid)).toEqual(samples.map((a) => a.uid));
  });
  it("filters by status, any of several", () => {
    const kept = filterRuns(rows, parseRunFilter({ ...none, status: "Completed,Stopped" }, rows));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBe(samples.filter((a) => a.status === "Completed" || a.status === "Stopped").length);
    expect(kept.every((r) => r.status === "Completed" || r.status === "Stopped")).toBe(true);
  });
  it("filters by template", () => {
    const name = samples[0].template.name;
    const kept = filterRuns(rows, parseRunFilter({ ...none, template: name }, rows));
    expect(kept.length).toBe(samples.filter((a) => a.template.name === name).length);
    expect(kept.every((r) => r.template === name)).toBe(true);
  });
  it("searches the ID, template, target and the status's words, case-insensitively", () => {
    const r = rows[0];
    for (const q of [r.id.toLowerCase(), r.template.toUpperCase(), r.target.slice(0, 6), RUN_STATUS[r.status].label.slice(0, 5)]) {
      expect(filterRuns(rows, parseRunFilter({ ...none, q }, rows)).map((x) => x.uid), q).toContain(r.uid);
    }
    expect(filterRuns(rows, parseRunFilter({ ...none, q: "no-such-run-zzz" }, rows))).toHaveLength(0);
  });
  it("combines the search with the chips", () => {
    const waiting = rows.find((r) => r.status === "Awaiting input")!;
    const both = parseRunFilter({ q: waiting.template, status: "Awaiting input", template: waiting.template }, rows);
    const kept = filterRuns(rows, both);
    expect(kept.map((r) => r.uid)).toContain(waiting.uid);
    expect(kept.every((r) => r.status === "Awaiting input" && r.template === waiting.template)).toBe(true);
    // the same template with another status: nothing, since the chips are ANDed
    const done = rows.filter((r) => r.template === waiting.template && r.status === "Completed");
    expect(filterRuns(rows, { ...both, status: ["Completed"] }).map((r) => r.uid)).toEqual(done.map((r) => r.uid));
    expect(runFilterMatches(waiting, { ...both, status: ["Completed"] })).toBe(false);
  });
});

describe("the chips' counts", () => {
  it("count each status some run has, in lib/status.ts order, and no other", () => {
    const counts = statusCounts(rows);
    const present = new Set(samples.map((a) => a.status));
    expect(counts.map((c) => c.value)).toEqual(RUN_STATUS_ORDER.filter((s) => present.has(s)));
    for (const c of counts) expect(c.count).toBe(samples.filter((a) => a.status === c.value).length);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(rows.length);
  });
  it("count each template used, commonest first, then by name", () => {
    const counts = templateCounts(rows);
    expect(new Set(counts.map((c) => c.value))).toEqual(new Set(samples.map((a) => a.template.name)));
    for (let i = 1; i < counts.length; i++) {
      const [a, b] = [counts[i - 1], counts[i]];
      expect(a.count > b.count || (a.count === b.count && a.value.localeCompare(b.value) < 0)).toBe(true);
    }
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(rows.length);
  });
});

describe("the rows", () => {
  it("carry what the row shows: findings counted without false positives, the worst, plan steps", () => {
    for (const [i, a] of samples.entries()) {
      const r = rows[i];
      const counted = a.findings.filter((f) => f.status !== "false-positive");
      expect(r.findings).toBe(counted.length);
      expect(r.steps.total).toBe(assessmentView(a).phases.length);
      expect(r.steps.done).toBeLessThanOrEqual(r.steps.total);
      if (a.status === "Awaiting input") expect(r.waiting).not.toBe("");
      else expect(r.waiting).toBe("");
    }
  });
  it("open the run's Overview: its uid, no view, no filters", () => {
    const href = runOverviewHref(rows[0].uid);
    const url = new URL(href, "http://127.0.0.1");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("uid")).toBe(rows[0].uid);
    expect([...url.searchParams.keys()]).toEqual(["uid"]);
    expect(runOverviewHref("a b&c")).toBe("/?uid=a%20b%26c");
  });
  it("page ten at a time, in words", () => {
    const many = Array.from({ length: 27 }, (_, i) => ({ ...rows[i % rows.length], uid: `u${i}` }));
    const p2 = paginate(many.length, "2");
    expect(p2.label).toBe("Page 2 of 3 · 27 results");
    expect(slicePage(many, p2).map((r) => r.uid)).toEqual(many.slice(PER_PAGE, 2 * PER_PAGE).map((r) => r.uid));
    expect(slicePage(many, paginate(many.length, "3"))).toHaveLength(7);
    expect(slicePage(many, paginate(many.length, "9")).map((r) => r.uid)).toEqual(many.slice(20).map((r) => r.uid)); // clamped
    const few = rows.slice(0, PER_PAGE);
    const one = paginate(few.length, "");
    expect(one.pages).toBe(1);
    expect(slicePage(few, one)).toHaveLength(few.length);
    expect(paginate(rows.length, "").pages).toBe(Math.ceil(rows.length / PER_PAGE)); // the sample spans pages
  });
});

describe("address keys", () => {
  it("are the same list view-url.ts clears on a drill-down", () => {
    expect([...ASSESSMENT_KEYS]).toEqual([...(VIEW_FILTERS.assessments ?? [])]);
  });
});
