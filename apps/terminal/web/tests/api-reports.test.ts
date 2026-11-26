/* The Report view's Core API reads (lib/api/reports.ts), its rows and summary strip
   (lib/api/adapt.ts), and the file route (/api/core-reports/<id>/download): read-only, the API's
   refusals passed on as it said them, a file name kept only when it is plain. Against the fake API. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signed: true }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined, signedIn: async () => auth.signed }));

import { sampleAssessments } from "./fixtures";
vi.mock("@/lib/data/store", async (original) => ({ ...await original<typeof import("@/lib/data/store")>(), loadAssessment: async (uid: string) => sampleAssessments().find(a => a.uid === uid) ?? null }));
import { GET } from "@/app/api/core-reports/[id]/download/route";
import { overviewStats, reportRow } from "@/lib/api/adapt";
import { CoreApiError, resetSession } from "@/lib/api/client";
import { type ApiOverview, type ApiReport, listReports, readOverview } from "@/lib/api/reports";

import { ASSESSMENT_ID, type FakeApi, installFakeApi, overviewOut, REPORT_ID, reportOut } from "./fakes/core-api";

let api: FakeApi;
beforeEach(() => {
  auth.signed = true;
  resetSession();
  api = installFakeApi();
});
afterEach(() => vi.unstubAllGlobals());

const download = (id: string, format: string) => GET(new Request(`http://127.0.0.1:3100/api/core-reports/${id}/download?format=${format}`), { params: Promise.resolve({ id }) });

describe("reading reports", () => {
  it("lists an assessment's reports and reads its overview", async () => {
    expect((await listReports(ASSESSMENT_ID)).map((r) => r.version)).toEqual([2]);
    expect((await readOverview(ASSESSMENT_ID)).tool_run_count).toBe(5);
    expect(api.calls.map((c) => c.path)).toContain(`/assessments/${ASSESSMENT_ID}/reports`);
  });

  it("refuses an id that isn't a UUID before calling", async () => {
    await expect(listReports("../findings")).rejects.toBeInstanceOf(CoreApiError);
    expect(api.calls.some((c) => c.method === "GET")).toBe(false);
  });

  it("fails loudly on a report that doesn't match the contract", async () => {
    api.answers.set(`/assessments/${ASSESSMENT_ID}/reports`, [{ status: 200, body: [{ ...reportOut, report_status: "DONE" }] }]);
    await expect(listReports(ASSESSMENT_ID)).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});

describe("report rows", () => {
  const r = reportOut as unknown as ApiReport;
  it("offers a READY, signed-off report's files", () => {
    const row = reportRow(r);
    expect([row.locked, row.formats, row.status.label, row.review.label, row.covers]).toEqual([null, ["PDF", "DOCX", "JSON"], "Ready", "Signed off", 1]);
  });
  it("says why a report's files are locked", () => {
    expect(reportRow({ ...r, report_status: "GENERATING" }).locked).toMatch(/^Generating: /);
    expect(reportRow({ ...r, signed_off: false, review_status: "PENDING" }).locked).toMatch(/^Review pending: /);
    expect(reportRow({ ...r, signed_off: false, review_status: null }).locked).toMatch(/^Not reviewed: .*TUI/);
    expect(reportRow({ ...r, formats: [] }).locked).toBe("The Core API holds no file for this version.");
    expect(reportRow({ ...r, signed_off: false }).locked).toMatch(/^The review shows as approved, but .*sign-off/);
  });
  it("names a combined report's assessments", () => expect(reportRow({ ...r, assessment_ids: ["a", "b", "c"] }).covers).toBe(3));
});

describe("the summary strip", () => {
  const o = overviewOut as unknown as ApiOverview;
  it("counts from the overview", () => {
    const [findings, plan, runs, masked] = overviewStats(o);
    expect([findings.value, findings.note, plan.value, plan.note, runs.value, runs.note, masked.value]).toEqual(["1", "1 high · worst severity", "3/4", "75% of the plan done", "5", "2m 05s from the first tool run to the last", "2"]);
  });
  it("says unrated findings are there rather than none", () => {
    const [findings] = overviewStats({ ...o, finding_count: 2, findings_by_severity: { UNKNOWN: 1, NONE: 1 } });
    expect([findings.note, findings.badges]).toEqual(["2 findings with no severity rating", []]);
  });
});

describe("saved report download", () => {
  const signed = sampleAssessments().flatMap(a => a.reports).find(r => r.signed_off && r.report_status === "READY")!;
  it("requires the dashboard session", async () => {
    auth.signed = false;
    expect((await download(signed.report_id, "JSON")).status).toBe(401);
  });
  it("validates the format and looks up the requested version", async () => {
    expect((await download(signed.report_id, "unknown")).status).toBe(400);
    expect((await download("missing-v7", "JSON")).status).toBe(404);
  });
  it("downloads a signed local report without a Core API call", async () => {
    const res = await download(signed.report_id, "JSON");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment;.*\.json/);
    expect((await res.json()).uid).toBe(signed.report_id.replace(/-v\d+$/, ""));
    expect(api.calls).toEqual([]);
  });
});
