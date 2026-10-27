/* The address rules behind the views (components/dashboard/view-url.ts): what switching views
   and switching runs keep and drop. Pure, so no window. */
import { describe, expect, it } from "vitest";

import { parseView, runHref, VIEWS, viewSearch } from "@/components/dashboard/view-url";

const params = (s: string) => Object.fromEntries(new URLSearchParams(s));

describe("viewSearch", () => {
  it("keeps the chosen run and drops the view left behind's own filters, including page", () => {
    const left = viewSearch("uid=run-1&view=findings&sev=HIGH&q=sql&page=3&finding=F-002", "assessments");
    expect(params(left)).toEqual({ uid: "run-1", view: "assessments" });
    const back = viewSearch("uid=run-1&view=assessments&q=demo&status=Completed&page=2", "findings");
    expect(params(back)).toEqual({ uid: "run-1", view: "findings" });
  });

  it("keeps a view's filters while it stays open, and replaces them on a drill-down", () => {
    expect(params(viewSearch("view=findings&sev=HIGH&page=2", "findings"))).toEqual({ view: "findings", sev: "HIGH", page: "2" });
    expect(params(viewSearch("view=findings&sev=HIGH&page=2&finding=F-003", "findings", { sev: "LOW" }))).toEqual({ view: "findings", sev: "LOW" });
    expect(params(viewSearch("uid=run-1&sev=HIGH", "findings", { finding: "F-001", q: "" }))).toEqual({ uid: "run-1", view: "findings", finding: "F-001" });
  });

  it("writes the overview as the plain address and treats an unknown view as the overview", () => {
    expect(viewSearch("view=findings&sev=HIGH&uid=run-1", "overview")).toBe("uid=run-1");
    expect(params(viewSearch("view=audit&sev=HIGH", "findings"))).toEqual({ view: "findings", sev: "HIGH" }); // nothing to clear: the overview has no filters
    expect(viewSearch("", "overview")).toBe("");
  });

  it("opens the Overview for the removed Audit log and Scope views", () => {
    expect(parseView("audit")).toBe("overview");
    expect(parseView("scope")).toBe("overview");
    expect(VIEWS).not.toContain("scope");
    expect(viewSearch("uid=run-1&view=scope", "overview")).toBe("uid=run-1");
    expect(params(viewSearch("view=scope&sev=HIGH", "findings"))).toEqual({ view: "findings", sev: "HIGH" });
  });
});

describe("runHref", () => {
  it("keeps the view and its filters, drops the finding and the page of the run left behind", () => {
    expect(runHref("view=findings&sev=HIGH&page=3&finding=run-2~F-001", "run-1")).toBe("/?view=findings&sev=HIGH&uid=run-1");
    expect(runHref("uid=run-1&view=findings&q=sql&page=2", null)).toBe("/?view=findings&q=sql");
    expect(runHref("", null)).toBe("/");
    expect(runHref("uid=run-1", "run-2")).toBe("/?uid=run-2");
    expect(runHref("view=reports&tpage=2", "run-1")).toBe("/?view=reports&uid=run-1"); // the Report's targets page too
    expect(runHref("uid=run-1&view=reports&tpage=2", null)).toBe("/?view=reports");
  });
});
