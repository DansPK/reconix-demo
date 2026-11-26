/* The address rules behind the views (components/dashboard/view-url.ts): what switching views
   and switching runs keep and drop. Pure, so no window. */
import { describe, expect, it } from "vitest";

import { parseView, runHref, VIEWS, viewSearch, viewUrl } from "@/components/dashboard/view-url";

const params = (s: string) => Object.fromEntries(new URLSearchParams(s));

describe("viewSearch", () => {
  it("keeps the chosen run except when opening Assessments, and drops the view left behind's filters", () => {
    const toReports = viewSearch("uid=run-1&view=findings&sev=HIGH&q=sql&page=3&finding=F-002", "reports");
    expect(params(toReports)).toEqual({ uid: "run-1" });
    const toAssessments = viewSearch("uid=run-1&assessment=uuid-1&view=findings&sev=HIGH&page=3&finding=F-002", "assessments");
    expect(params(toAssessments)).toEqual({});
    const back = viewSearch("uid=run-1&view=assessments&q=demo&status=Completed&page=2", "findings");
    expect(params(back)).toEqual({ uid: "run-1" });
    const leftKnowledge = viewSearch("view=knowledge&doc=d10f0984-d24e-439f-a78b-a23995bae172&part=31", "assistant");
    expect(params(leftKnowledge)).toEqual({});
  });

  it("keeps a view's filters while it stays open, and replaces them on a drill-down", () => {
    expect(params(viewSearch("sev=HIGH&page=2", "findings", undefined, "/findings"))).toEqual({ sev: "HIGH", page: "2" });
    expect(params(viewSearch("sev=HIGH&page=2&finding=F-003", "findings", { sev: "LOW" }, "/findings"))).toEqual({ sev: "LOW" });
    expect(params(viewSearch("uid=run-1&sev=HIGH", "findings", { finding: "F-001", q: "" }))).toEqual({ uid: "run-1", finding: "F-001" });
  });

  it("writes clean path URLs via viewUrl and treats an unknown view as the overview", () => {
    expect(viewUrl("/findings/run-1", "sev=HIGH", "overview")).toBe("/assessments/run-1");
    expect(viewUrl("/findings/run-1", "sev=HIGH", "reports")).toBe("/reports/run-1");
    expect(viewUrl("/", "view=audit&sev=HIGH", "findings")).toBe("/findings?sev=HIGH");
    expect(viewUrl("/assistant/run-1", "", "assessments")).toBe("/assessments");
    expect(viewUrl("/", "", "overview")).toBe("/");
  });

  it("opens the Overview for the removed Audit log and Scope views", () => {
    expect(parseView("audit")).toBe("overview");
    expect(parseView("scope")).toBe("overview");
    expect(VIEWS).not.toContain("scope");
    expect(viewSearch("uid=run-1&view=scope", "overview")).toBe("uid=run-1");
    expect(params(viewSearch("view=scope&sev=HIGH", "findings"))).toEqual({ sev: "HIGH" });
  });
});

describe("runHref", () => {
  it("keeps the view path and its filters, drops the finding and the page of the run left behind", () => {
    expect(runHref("sev=HIGH&page=3&finding=run-2~F-001", "run-1", "/findings")).toBe("/findings/run-1?sev=HIGH");
    expect(runHref("q=sql&page=2", null, "/findings/run-1")).toBe("/findings?q=sql");
    expect(runHref("", null, "/")).toBe("/");
    expect(runHref("", "run-2", "/assessments/run-1")).toBe("/assessments/run-2");
  });

  it("returns to Overview when selecting a specific assessment from the Assessments view", () => {
    expect(runHref("q=demo&status=Completed&template=API&page=2", "run-1", "/assessments")).toBe("/assessments/run-1");
    expect(runHref("", null, "/assessments")).toBe("/assessments");
  });
});
