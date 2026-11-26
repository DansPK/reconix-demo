/* lib/api/library.ts runOf: one Core API assessment as the run the Overview reads. A finding the
   API rates NONE or UNKNOWN used to fail the run shape and drop the whole assessment from the
   Overview; now it is kept (out of the four-level severity counts). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadApiLibrary, resetApiLibraryCache, runOf } from "@/lib/api/library";
import { resetSessions } from "@/lib/api/sessions";
import { buildContext } from "@/lib/assistant/context";
import { installFakeApi } from "./fakes/core-api";

const AT = "2026-11-11T12:39:56.274575Z";
const row = {
  assessment_id: "5cf06e1c-ad43-4df2-8626-e0778f9e4a1f",
  engagement_code: "RCX-2026-0001",
  name: "RCX-001",
  type: "web_url",
  assessment_status: "ACTIVE",
  created_by: "tester@lab",
  created_at: AT,
  updated_at: AT,
  session_id: "74d2e01c-b6b0-4825-97bd-128fe3bcb31a",
  targets: ["https://testphp.vulnweb.com/"],
  pending_approval_count: 0,
};
const overview = { targets: row.targets, first_started_at: AT, last_finished_at: null, request_count: 0, plan_step_count: 5, plan_step_done_count: 1 };
const finding = (severity_status: string) => ({
  code: `F-${severity_status}`,
  title: "A finding",
  target: row.targets[0],
  description: "",
  severity_status,
  cvss_score: null,
  cwe_ids: [],
  owasp_id: [],
  cve_ids: [],
  impact: null,
  remediation: null,
  validation_status: "UNCONFIRMED",
  finding_status: "OPEN",
  tools: ["whatweb"],
});

describe("runOf", () => {
  it("keeps an assessment whose findings are NONE or UNKNOWN", () => {
    const run = runOf(row, overview, [finding("NONE"), finding("UNKNOWN"), finding("HIGH")], [], [], [], "Completed");
    expect(run.status).toBe("Completed");
    expect(run.findings.map((f) => f.severity)).toEqual(["NONE", "UNKNOWN", "HIGH"]);
  });

  it("uses the formatted template type label rather than the assessment name", () => {
    const run = runOf(row, overview, [], [], [], []);
    expect(run.template.name).toBe("Web URL");
  });

  it("uses the API's own status without a live one", () => {
    expect(runOf(row, overview, [], [], [], []).status).toBe("Running");
  });
});

it("uses the same validated data for assistant runs and evidence context", () => {
  const source = {
    ...finding("HIGH"), finding_category: "INFORMATIONAL_DISCOVERY",
    cvss_score: "9.1", cwe_ids: ["CWE-89"], cve_ids: ["CVE-2026-0001"],
    validation_status: "CONFIRMED", verification_status: "CONFIRMED", confidence_level: "MEDIUM",
  };
  const run = runOf(row, overview, [source], [], [], [], "Completed");
  expect(run.findings[0]).toMatchObject({
    finding_category: "INFORMATIONAL_DISCOVERY", severity: "UNKNOWN", cwe: [], cve: [],
    validated_cvss_score: null, verification_status: "CONFIRMED",
  });
  const text = buildContext([run], run.uid)?.text ?? "";
  expect(text).toContain("category INFORMATIONAL_DISCOVERY");
  expect(text).toContain("confidence MEDIUM");
  expect(text).not.toContain("CWE-89");
  expect(text).not.toContain("CVSS 9.1");
});

describe("loadApiLibrary cache", () => {
  beforeEach(() => {
    resetSessions();
    resetApiLibraryCache();
  });
  afterEach(() => {
    resetApiLibraryCache();
    vi.unstubAllGlobals();
  });

  it("reuses the cached library within the TTL window without refetching", async () => {
    const api = installFakeApi();
    api.answers.set("/assessments", [
      { status: 200, body: [] },
      { status: 200, body: [] },
    ]);

    const first = await loadApiLibrary();
    const callsAfterFirst = api.calls.length;
    const second = await loadApiLibrary();

    expect(second).toBe(first);
    expect(api.calls.length).toBe(callsAfterFirst);
  });

  it("deduplicates concurrent calls into one in-flight fetch", async () => {
    const api = installFakeApi();
    api.answers.set("/assessments", [{ status: 200, body: [] }]);

    const [a, b] = await Promise.all([loadApiLibrary(), loadApiLibrary()]);
    expect(a).toBe(b);
    expect(api.calls.filter((c) => c.path === "/assessments")).toHaveLength(1);
  });

  it("serves stale data immediately and refreshes in the background", async () => {
    vi.useFakeTimers();
    try {
      const api = installFakeApi();
      api.answers.set("/assessments", [
        { status: 200, body: [] },
        { status: 200, body: [] },
      ]);

      const first = await loadApiLibrary();
      vi.advanceTimersByTime(6_000); // past fresh window (5s), inside stale window (60s)

      const stale = await loadApiLibrary();
      expect(stale).toBe(first); // returned immediately without waiting

      // Let the background refresh resolve
      await vi.advanceTimersByTimeAsync(0);
      const refreshed = await loadApiLibrary();
      expect(refreshed).not.toBe(first);
      expect(api.calls.filter((c) => c.path === "/assessments")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
