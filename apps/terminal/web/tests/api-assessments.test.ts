/* The Assessments view's Core API reader (lib/api/assessments.ts): GET /assessments checked
   against AssessmentRowOut, and each row turned into the view's ReportRunRow. Against the fake
   API. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));
const auth = vi.hoisted(() => ({ signed: true }));
vi.mock("@/lib/assistant/access", async (original) => {
  const real = await original<typeof import("@/lib/assistant/access")>();
  return { ...real, refuse: async () => (auth.signed ? null : real.fail("Sign in first.", 401)) };
});

import { GET } from "@/app/api/core-assessments/route";
import { assessmentRunRow, listAssessmentRows, liveStatus, type PlanRun, readPlanRun, STALE_MS, typeLabel, uidOfRow } from "@/lib/api/assessments";
import { CoreApiError, NOT_RUNNING, resetSession } from "@/lib/api/client";

import { ASSESSMENT_ID, assessmentRow, type FakeApi, installFakeApi, SESSION_ID } from "./fakes/core-api";

let api: FakeApi;
beforeEach(() => {
  auth.signed = true;
  resetSession();
  api = installFakeApi();
});
afterEach(() => vi.unstubAllGlobals());

const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(CoreApiError);
  return e as CoreApiError;
};

describe("listAssessmentRows", () => {
  it("reads every row the API sends", async () => {
    const [row] = await listAssessmentRows();
    expect(row.assessment_id).toBe(ASSESSMENT_ID);
    expect(row.plan_step_count).toBe(4);
  });

  it("refuses a row missing a field the view shows", async () => {
    const short: Record<string, unknown> = { ...assessmentRow };
    delete short.plan_step_count;
    api.answers.set("/assessments", [{ status: 200, body: [short] }]);
    expect((await refusal(listAssessmentRows())).code).toBe("BAD_RESPONSE");
  });

  it("shows the API's own refusal", async () => {
    api.answers.set("/assessments", [{ status: 429, body: { code: "RATE_LIMITED", message: "Too many requests.", details: {} } }]);
    const e = await refusal(listAssessmentRows());
    expect([e.code, e.status]).toEqual(["RATE_LIMITED", 429]);
  });

  it("says the API is not running when it can't be reached", async () => {
    api.down = true;
    expect((await refusal(listAssessmentRows())).message).toBe(NOT_RUNNING);
  });
});

const base = { ...assessmentRow, assessment_status: "ACTIVE" as const, worst_severity: "HIGH" as const };
const NOW = Date.parse("2026-11-11T15:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const ran: PlanRun = { status: "COMPLETED", startedAt: at(5) };
const agentRun = (status: string, startedAt: string, task: string | null, assessment_id: string | null = ASSESSMENT_ID) => ({
  agent_run_id: "88888888-8888-4888-8888-888888888888",
  agent_runs_status: status,
  model_name: "fake-model",
  plan: task ? { task } : null,
  started_at: startedAt,
  finished_at: null,
  session_id: SESSION_ID,
  assessment_id,
});

describe("readPlanRun", () => {
  it("picks the assessment's newest plan run, not chat, report or another assessment's", async () => {
    api.answers.set(`/sessions/${SESSION_ID}/agent-runs`, [
      {
        status: 200,
        body: [
          agentRun("COMPLETED", at(1), "REPORT"),
          agentRun("RUNNING", at(2), "SUGGEST", null),
          agentRun("RUNNING", at(3), null),
          agentRun("FAILED", at(4), "SUGGEST"),
          agentRun("COMPLETED", at(9), "PLAN"),
        ],
      },
    ]);
    expect(await readPlanRun(base)).toEqual({ status: "FAILED", startedAt: at(4) });
  });

  it("is null with no plan run yet", async () => expect(await readPlanRun(base)).toBeNull());

  it("refuses an answer that doesn't match the contract", async () => {
    api.answers.set(`/sessions/${SESSION_ID}/agent-runs`, [{ status: 200, body: [agentRun("DONE", at(1), "PLAN")] }]);
    expect((await refusal(readPlanRun(base))).code).toBe("BAD_RESPONSE");
  });
});

describe("liveStatus (the newest plan run)", () => {
  const show = (status: NonNullable<PlanRun>["status"], minutesAgo = 1) => liveStatus(base, { status, startedAt: at(minutesAgo) }, NOW);

  it.each([
    ["RUNNING", "Running"],
    ["WAITING_APPROVAL", "Awaiting input"],
    ["COMPLETED", "Completed"],
    ["FAILED", "Interrupted"],
    ["CANCELLED", "Stopped"],
  ] as const)("%s → %s", (status, shown) => expect(show(status)).toBe(shown));

  it("is Interrupted when a run is still RUNNING past the API's 30-minute cut-off (the TUI was killed)", () => {
    expect(show("RUNNING", STALE_MS / 60_000 + 1)).toBe("Interrupted");
    expect(show("RUNNING", STALE_MS / 60_000 - 1)).toBe("Running");
  });
  it("waits for you while an approval waits, whatever the run says", () => {
    expect(liveStatus({ ...base, pending_approval_count: 1 }, ran, NOW)).toBe("Awaiting input");
  });
  it("is New with no plan run yet", () => expect(liveStatus(base, null, NOW)).toBe("New"));
  it.each([
    ["COMPLETED", "Completed"],
    ["CANCELLED", "Stopped"],
    ["DRAFT", "New"],
  ] as const)("keeps the API's %s assessment as is", (status, shown) =>
    expect(liveStatus({ ...base, assessment_status: status }, { status: "RUNNING", startedAt: at(1) }, NOW)).toBe(shown),
  );
});

describe("assessmentRunRow", () => {
  it("keeps the API's counts and opens the assessment's overview", () => {
    const r = assessmentRunRow(base, ran);
    const expectedUid = uidOfRow(base);
    expect(r).toMatchObject({ uid: expectedUid, id: "Juice Shop web", template: "Web", status: "Completed", findings: 2, worst: "HIGH", steps: { done: 3, total: 4 }, waiting: "" });
    expect(r.href).toBe(`/?uid=${encodeURIComponent(expectedUid)}`);
  });

  it("shows a NONE worst severity, never drops it", () => {
    expect(assessmentRunRow({ ...base, worst_severity: "NONE" }, ran).worst).toBe("NONE");
  });

  it("says how many approvals wait", () => {
    const r = assessmentRunRow({ ...base, pending_approval_count: 2 }, ran);
    expect([r.status, r.waiting]).toEqual(["Awaiting input", "2 approvals"]);
  });

  it("falls back to the engagement code without a name", () => {
    expect(assessmentRunRow({ ...base, name: "" }, ran).id).toBe("ENG-TEST");
  });
});

describe("GET /api/core-assessments (the view's live poll)", () => {
  const ask = () => GET(new Request("http://127.0.0.1:3100/api/core-assessments"));

  it("answers the fresh rows", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { rows } = await res.json();
    expect(rows.map((r: { uid: string; status: string }) => [r.uid, r.status])).toEqual([[uidOfRow(assessmentRow), "New"]]);
  });

  it("refuses without a session", async () => {
    auth.signed = false;
    expect((await ask()).status).toBe(401);
    expect(api.calls).toEqual([]);
  });

  it("passes the API's refusal on, and 503 when it is down", async () => {
    api.answers.set("/assessments", [{ status: 429, body: { code: "RATE_LIMITED", message: "Too many requests.", details: {} } }]);
    expect((await ask()).status).toBe(429);
    api.down = true;
    const res = await ask();
    expect(res.status).toBe(503);
    expect((await res.json()).detail).toContain(NOT_RUNNING);
  });
});

describe("typeLabel", () => {
  it.each([
    ["web_url", "Web URL"],
    ["api", "API"],
    ["source_code", "Source Code"],
    ["", "—"],
  ])("%s → %s", (type, label) => expect(typeLabel(type)).toBe(label));
});
