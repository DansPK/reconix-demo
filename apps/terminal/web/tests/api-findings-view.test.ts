/* The Findings view from the Core API (components/dashboard/api-findings.tsx), rendered to
   markup against the fake API: no assessment picker is rendered inside the view, unknown ids
   skip /findings, a refused findings call shows the error, a saved run's link gets its note, and
   UNKNOWN and NONE severities are listed and sorted last. */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { ApiFindings } from "@/components/dashboard/api-findings";
import { sortFindings } from "@/components/dashboard/filters";
import { apiFindingRows } from "@/lib/api/adapt";
import { resetSession } from "@/lib/api/client";
import type { ApiFinding } from "@/lib/api/findings";

import { ASSESSMENT_ID, assessmentRow, type FakeApi, findings, installFakeApi } from "./fakes/core-api";

let api: FakeApi;
beforeEach(() => {
  resetSession();
  api = installFakeApi();
});
afterEach(() => vi.unstubAllGlobals());

const render = async (assessmentId: string | null, savedRun: string | null = null) => renderToStaticMarkup(await ApiFindings({ assessmentId, savedRun }));
const OTHER = "99999999-9999-4999-8999-999999999999";

describe("ApiFindings", () => {
  it("lists the findings without an inline assessment picker", async () => {
    const html = await render(ASSESSMENT_ID);
    expect(html).not.toContain("<select");
    expect(html).toContain("SQL injection in search");
  });

  it("skips asking for findings for an id the API doesn't know", async () => {
    const html = await render(OTHER);
    expect(html).not.toContain("<select");
    expect(html).toContain("The Core API has no assessment with that id.");
    expect(api.calls.some((c) => c.path.startsWith("/findings"))).toBe(false);
  });

  it("treats the API's 404 ASSESSMENT_NOT_FOUND the same way (deleted in between)", async () => {
    api.answers.set(`/findings?assessment_id=${ASSESSMENT_ID}`, [{ status: 404, body: { code: "ASSESSMENT_NOT_FOUND", message: "No assessment with this id.", details: {} } }]);
    const html = await render(ASSESSMENT_ID);
    expect(html).not.toContain("<select");
    expect(html).toContain("The Core API has no assessment with that id.");
  });

  it("shows a refusal of the findings as the API said it", async () => {
    api.answers.set("/findings", [{ status: 429, body: { code: "RATE_LIMITED", message: "Too many requests.", details: {} } }]);
    const html = await render(null);
    expect(html).not.toContain("<select");
    expect(html).toContain("Too many requests.");
    expect(html).toContain("RATE_LIMITED");
  });

  it("shows only the note when the assessments can't be read", async () => {
    api.down = true;
    const html = await render(null);
    expect(html).not.toContain("<select");
    expect(html).toContain("Core API not running");
  });

  it("says a saved run's link can't be followed, and lists every assessment", async () => {
    const html = await render(null, "run-20261101-0900");
    expect(html).toContain("doesn&#x27;t know the saved run");
    expect(html).toContain("run-20261101-0900");
    expect(html).toContain("SQL injection in search");
  });
});

describe("rows from the API", () => {
  const f = (code: string, severity_status: ApiFinding["severity_status"], finding_id: string) => ({ ...(findings[0] as unknown as ApiFinding), code, severity_status, finding_id });

  it("keys a code two findings share by finding_id, and the rest by code", () => {
    const rows = apiFindingRows([f("F-001", "HIGH", "a1"), f("F-001", "LOW", "a2"), f("F-003", "LOW", "a3")]);
    expect(rows.map((r) => r.key)).toEqual(["a1", "a2", "F-003"]);
    const across = apiFindingRows([f("F-001", "HIGH", "a1")], [assessmentRow]);
    expect(across[0].key).toBe(`${ASSESSMENT_ID}~F-001`);
  });

  it("sorts NONE then UNKNOWN after LOW, keeping both", () => {
    const rows = apiFindingRows([f("F-1", "NONE", "1"), f("F-2", "UNKNOWN", "2"), f("F-3", "LOW", "3"), f("F-4", "CRITICAL", "4")]);
    expect(sortFindings(rows).map((r) => r.severity)).toEqual(["CRITICAL", "LOW", "NONE", "UNKNOWN"]);
  });
});
