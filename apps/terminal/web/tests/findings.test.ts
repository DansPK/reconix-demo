/* The Findings view's page and selection rules (components/dashboard/filters.ts): which page is
   shown, which row is selected, and what paging, a filter change and Previous / Next change in
   the address. Pure, over the derived sample findings. */
import { describe, expect, it } from "vitest";

import { deriveDashboard, findingRow } from "@/components/dashboard/derive";
import {
  filterActive,
  filterPatch,
  findingsHeadline,
  neighbours,
  pagePatch,
  pageParam,
  parseFindingFilter,
  resolveFindingsPage,
  safeFindingKey,
  sortFindings,
} from "@/components/dashboard/filters";
import { assessmentView } from "@/lib/data/adapt";
import { PER_PAGE } from "@/lib/paging";

import { sampleAssessments } from "./fixtures";

const dashes = sampleAssessments().map((a) => deriveDashboard(assessmentView(a)));
const one = dashes[0].findings;
/** Thirty findings keyed by run, as the every-run list is (three pages). */
const many = sortFindings(
  Array.from({ length: 30 }, (_, i) => {
    const f = one[i % one.length];
    return findingRow({ ...f, id: `F-${String(i + 1).padStart(3, "0")}` }, { uid: `run-${Math.floor(i / 10)}`, label: `RUN ${Math.floor(i / 10)}` });
  }),
);
const key = (i: number) => many[i].key;

describe("resolveFindingsPage", () => {
  it("shows the first page and selects its first row when the address names nothing", () => {
    const page = resolveFindingsPage(many, many, "", "");
    expect(page.paging).toMatchObject({ page: 1, pages: 3, total: 30 });
    expect(page.rows).toHaveLength(PER_PAGE);
    expect(page.current).toBe(many[0]);
    expect(page).toMatchObject({ index: 0, explicit: false, missing: "" });
  });

  it("selects the first row of the page the address names", () => {
    const page = resolveFindingsPage(many, many, "", "3");
    expect(page.paging.page).toBe(3);
    expect(page.rows).toEqual(many.slice(20, 30));
    expect(page.current).toBe(many[20]);
    expect(page.index).toBe(20);
  });

  it("opens the page that holds a named finding, whatever page the address says", () => {
    const page = resolveFindingsPage(many, many, key(15), "1");
    expect(page.paging.page).toBe(2);
    expect(page.current).toBe(many[15]);
    expect(page).toMatchObject({ index: 15, explicit: true, missing: "" });
    expect(page.rows.map((f) => f.key)).toContain(key(15));
  });

  it("falls back to the page's first row and says why when the named finding is not in the list", () => {
    const filtered = many.filter((f) => f.key !== key(2));
    const hidden = resolveFindingsPage(filtered, many, key(2), "");
    expect(hidden.current).toBe(filtered[0]);
    expect(hidden).toMatchObject({ explicit: false, missing: "filtered" });
    const unknown = resolveFindingsPage(many, many, "<script>no-such", "2");
    expect(unknown.current).toBe(many[10]);
    expect(unknown).toMatchObject({ explicit: false, missing: "unknown", index: 10 });
  });

  it("says a named false positive is hidden as one while false positives are not listed", () => {
    const fp = { ...many[4], falsePositive: true };
    const all = many.map((f, i) => (i === 4 ? fp : f));
    const listed = all.filter((f) => !f.falsePositive);
    expect(resolveFindingsPage(listed, all, fp.key, "", false)).toMatchObject({ explicit: false, missing: "false-positive", current: listed[0] });
    // shown, but hidden by another filter: the usual "hidden by the filters"
    expect(resolveFindingsPage(listed, all, fp.key, "", true)).toMatchObject({ missing: "filtered" });
    expect(resolveFindingsPage(all, all, fp.key, "", true)).toMatchObject({ explicit: true, missing: "", current: fp });
  });

  it("has nothing selected only when the list is empty", () => {
    const page = resolveFindingsPage([], many, key(0), "4");
    expect(page.current).toBeNull();
    expect(page).toMatchObject({ index: -1, missing: "filtered" });
    expect(page.paging).toMatchObject({ page: 1, pages: 1, total: 0 });
  });
});

describe("pagePatch", () => {
  it("keeps the selection when its row is on the new page, else lets the page's first row take over", () => {
    expect(pagePatch(many, 2, key(12))).toEqual({ page: "2", finding: key(12) });
    expect(pagePatch(many, 2, key(3))).toEqual({ page: "2", finding: "" });
    expect(pagePatch(many, 1, key(3))).toEqual({ page: "", finding: key(3) }); // the first page is the plain address
  });
  it("clamps a page out of range", () => {
    expect(pagePatch(many, 9, "")).toEqual({ page: "3", finding: "" });
    expect(pagePatch(many, 0, "")).toEqual({ page: "", finding: "" });
  });
  it("writes the first page as no page at all", () => {
    expect(pageParam(1)).toBe("");
    expect(pageParam(2)).toBe("2");
  });
});

describe("filterPatch", () => {
  const none = parseFindingFilter({ sev: "", val: "", q: "" });
  it("goes back to the first page and keeps a selection only while it still matches", () => {
    const f = many[0];
    const same = parseFindingFilter({ sev: f.severity, val: "", q: "" });
    expect(filterPatch(many, same, f.key)).toEqual({ page: "", finding: f.key });
    const other = parseFindingFilter({ sev: "", val: "", q: "no-such-thing-zzz" });
    expect(filterPatch(many, other, f.key)).toEqual({ page: "", finding: "" });
    expect(filterPatch(many, none, "")).toEqual({ page: "", finding: "" });
    expect(filterPatch(many, none, "unknown-key")).toEqual({ page: "", finding: "" });
  });
});

describe("parseFindingFilter", () => {
  it("drops unknown severities and validation buckets from the address", () => {
    expect(parseFindingFilter({ sev: "HIGH,<script>,LOW", val: "review", q: " x " })).toEqual({ sev: ["HIGH", "LOW"], val: "review", q: " x ", fp: false });
    expect(parseFindingFilter({ sev: "", val: "nope", q: "" })).toEqual({ sev: [], val: "", q: "", fp: false });
  });
  it("lists the false positives only for fp=1", () => {
    expect(parseFindingFilter({ sev: "", val: "", q: "", fp: "1" }).fp).toBe(true);
    for (const fp of ["", "0", "true", "yes", "<script>"]) expect(parseFindingFilter({ sev: "", val: "", q: "", fp }).fp).toBe(false);
    expect(filterActive(parseFindingFilter({ sev: "", val: "", q: "", fp: "1" }))).toBe(true); // Clear filters hides them again
  });
  it("knows when a filter is on", () => {
    expect(filterActive(parseFindingFilter({ sev: "", val: "", q: "  " }))).toBe(false);
    expect(filterActive(parseFindingFilter({ sev: "HIGH", val: "", q: "" }))).toBe(true);
    expect(filterActive(parseFindingFilter({ sev: "", val: "closed", q: "" }))).toBe(true);
    expect(filterActive(parseFindingFilter({ sev: "", val: "", q: "sql" }))).toBe(true);
  });
});

describe("neighbours", () => {
  it("walks the filtered order across page ends", () => {
    expect(neighbours(many, 0)).toEqual({ prev: null, next: many[1] });
    expect(neighbours(many, 9)).toEqual({ prev: many[8], next: many[10] }); // page 1 → page 2
    expect(neighbours(many, 29)).toEqual({ prev: many[28], next: null });
    expect(neighbours(many, -1)).toEqual({ prev: null, next: null });
  });
});

describe("findingsHeadline", () => {
  it("counts the findings, and the assessments when every run is shown", () => {
    expect(findingsHeadline(18, 6)).toBe("18 findings across 6 assessments · select one to see its evidence and remediation.");
    expect(findingsHeadline(1, 1)).toBe("1 finding across 1 assessment · select one to see its evidence and remediation.");
    expect(findingsHeadline(3, null)).toBe("3 findings · select one to see its evidence and remediation.");
    expect(findingsHeadline(0, null)).toBe("No findings in this assessment yet.");
    expect(findingsHeadline(0, 4)).toBe("No findings in any saved assessment yet.");
    // false positives are never in the count
    expect(findingsHeadline(3, null, 1)).toBe("3 findings · select one to see its evidence and remediation.");
    expect(findingsHeadline(0, null, 1)).toBe("No findings in this assessment, only 1 false positive.");
    expect(findingsHeadline(0, 2, 2)).toBe("No findings in any saved assessment, only 2 false positives.");
  });
});

describe("safeFindingKey", () => {
  it("accepts the keys the view hands out and nothing else", () => {
    expect(safeFindingKey("F-001")).toBe(true);
    expect(safeFindingKey("IMP-002")).toBe(true);
    expect(safeFindingKey("20261005-140300-9f76_RCX-002~F-001")).toBe(true);
    for (const bad of ["", "<script>", "F-001 ", "a~b~c", "x".repeat(49), "F-001?x=1", "run~F-001\n"]) expect(safeFindingKey(bad)).toBe(false);
  });
});
