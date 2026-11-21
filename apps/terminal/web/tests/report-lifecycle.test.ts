/* Report readiness is enforced for the rendered controls and for direct download requests. */
import { describe, expect, it, vi } from "vitest";

import { formatLock, latestReport, reportLock, type ReportVersion } from "@/lib/report/lifecycle";

const ready: ReportVersion = {
  report_id: "report-001", version: 1, report_status: "READY",
  review_status: "APPROVED", signed_off: true, formats: ["PDF", "DOCX", "JSON"],
  generated_at: "2026-11-20T10:00:00+00:00",
};

describe("scripted report lifecycle", () => {
  it("requires a READY version and an approved sign-off", () => {
    expect(reportLock(ready)).toBeNull();
    expect(reportLock(null)).toMatch(/No report version/);
    expect(reportLock({ ...ready, report_status: "GENERATING" })).toMatch(/generating/);
    expect(reportLock({ ...ready, report_status: "FAILED" })).toMatch(/failed/);
    expect(reportLock({ ...ready, signed_off: false })).toMatch(/sign-off/);
    expect(reportLock({ ...ready, review_status: "PENDING" })).toMatch(/sign-off/);
    expect(reportLock({ ...ready, review_status: "REJECTED" })).toMatch(/rejected/);
  });

  it("does not export an older approved version when the latest snapshot is unreviewed", () => {
    const newest = { ...ready, report_id: "report-002", version: 2, signed_off: false };
    expect(latestReport([newest, ready])).toEqual(newest);
    expect(formatLock(latestReport([ready, newest]), "pdf")).toMatch(/sign-off/);
  });

  it("allows only the formats recorded for that version", () => {
    expect(formatLock(ready, "docx")).toBeNull();
    expect(formatLock({ ...ready, formats: ["DOCX"] }, "pdf")).toMatch(/no PDF file/);
  });
});

const { loadAssessment, renderFile } = vi.hoisted(() => ({
  loadAssessment: vi.fn(), renderFile: vi.fn(),
}));
vi.mock("@/lib/data/store", () => ({ loadAssessment }));
vi.mock("@/lib/report/render", () => ({ renderFile }));

describe("direct report download", () => {
  it("refuses an unsigned version before rendering any file", async () => {
    const { GET } = await import("@/app/api/assessments/[uid]/export/route");
    loadAssessment.mockResolvedValue({ reports: [{ ...ready, signed_off: false }] });
    const response = await GET(new Request("http://127.0.0.1/api/assessments/run/export?format=json"), {
      params: Promise.resolve({ uid: "run" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: expect.stringMatching(/sign-off/) });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(renderFile).not.toHaveBeenCalled();
  });
});
