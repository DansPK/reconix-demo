/* The dashboard's Core API integration (lib/api/library.ts, app/page.tsx):
   Overview, Assessments, Run log and the TopBar assessment switcher reading real assessments
   from the Core API, matching by ?uid= and ?assessment=<uuid>, and falling back to local files
   when the Core API is unreachable or in mock mode. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));
const TOKEN = "dashboard-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined),
  }),
}));
vi.mock("@/lib/auth/guard", () => ({
  requireSignedIn: async () => undefined,
  signedIn: async () => true,
}));

import Home from "@/app/page";
import { loadApiLibrary } from "@/lib/api/library";
import { loadAssessment } from "@/lib/data/store";
import { COOKIE, sessionValue } from "@/lib/auth/session";
import { resetSessions } from "@/lib/api/sessions";
import { type FakeCore, startFakeCore } from "./fakes/core-api-server";

let core: FakeCore;
beforeAll(async () => {
  core = await startFakeCore();
});
afterAll(() => core.close());

const savedEnv = { ...process.env };
const ASSESSMENT_UUID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const ACTION_UUID = "9b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e";
const APPROVAL_UUID = "ac3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f";

function seedCoreAssessment() {
  core.sessions.set("session-api-1", {
    session_id: "session-api-1",
    interface: "web",
    session_status: "ACTIVE",
    created_at: "2026-11-12T08:00:00Z",
    closed_at: null,
  });
  core.assessments.push({
    row: {
      assessment_id: ASSESSMENT_UUID,
      engagement_code: "ENG-API-001",
      name: "API Assessment Target",
      type: "WEB",
      assessment_status: "ACTIVE",
      created_by: "analyst@reconix.test",
      created_at: "2026-11-12T08:00:00Z",
      updated_at: "2026-11-12T09:30:00Z",
      session_id: "session-api-1",
      targets: ["https://api.target.example"],
      finding_count: 1,
      worst_severity: "HIGH",
      pending_approval_count: 0,
    },
    overview: {
      targets: ["https://api.target.example"],
      first_started_at: "2026-11-12T08:05:00Z",
      last_finished_at: null,
      request_count: 24,
      plan_step_count: 3,
      plan_step_done_count: 2,
    },
    findings: [
      {
        code: "F-001",
        title: "SQL Injection in parameter",
        target: "https://api.target.example/query",
        description: "SQLi found in /query",
        severity_status: "HIGH",
        cvss_score: "8.5",
        cwe_ids: ["CWE-89"],
        owasp_id: ["A03:2021"],
        cve_ids: [],
        impact: "DB compromise",
        remediation: "Parameterize queries",
        validation_status: "CONFIRMED",
        finding_status: "OPEN",
        tools: ["SQLMAP"],
      },
    ],
    actions: [
      {
        action_id: ACTION_UUID,
        tool: "NMAP",
        args: ["-p", "443"],
        target: "api.target.example",
        purpose: "Port scanning",
        risk_level: "LOW",
        action_status: "COMPLETED",
        guardrail_report: {},
        created_at: "2026-11-12T08:10:00Z",
        approval_id: null,
        tool_runs: [{ request_count: 1 }],
      },
    ],
    events: [
      {
        event_type: "SCOPE_APPROVED",
        at: "2026-11-12T08:01:00Z",
        actor: "analyst@reconix.test",
        details: {},
      },
      {
        event_type: "TOOL_RUN_COMPLETED",
        at: "2026-11-12T08:15:00Z",
        actor: "system",
        details: { tool: "NMAP", target: "api.target.example" },
      },
    ],
  });
  core.approvals.push({
    approval_id: APPROVAL_UUID,
    kind: "action",
    subject_snapshot: { tool: "NMAP", target: "api.target.example", args: ["-p", "443"] },
    subject_hash: "hash123",
    risk_level: "LOW",
    approval_status: "APPROVED",
    reason: null,
    decided_by: "analyst@reconix.test",
    decided_at: "2026-11-12T08:02:00Z",
    action_id: ACTION_UUID,
  });
}

beforeEach(() => {
  process.env.RECONIX_WEB_TOKEN = TOKEN;
  process.env.RECONIX_DATA_DIR = "tests/sample-data";
  process.env.RECONIX_CORE_API = core.url;
  delete process.env.RECONIX_MOCK;
  cookie = sessionValue(TOKEN);
  resetSessions();
  core.sessions.clear();
  core.tokens.clear();
  core.messages.length = 0;
  core.providers.length = 0;
  core.calls.length = 0;
  core.runs.clear();
  core.listFails = false;
  core.assessments.length = 0;
  core.approvals.length = 0;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("loadApiLibrary", () => {
  it("fetches assessment runs with core_id and uid from the Core API", async () => {
    seedCoreAssessment();
    const lib = await loadApiLibrary();

    expect(lib.dir).toBe("Core API");
    expect(lib.assessments).toHaveLength(1);

    const run = lib.assessments[0];
    expect(run.core_id).toBe(ASSESSMENT_UUID);
    expect(run.assessment_id).toBe("ENG-API-001");
    expect(run.target).toBe("https://api.target.example");
    expect(run.findings).toHaveLength(1);
    expect(run.findings[0].title).toBe("SQL Injection in parameter");
    expect(run.plan).toHaveLength(1);
    expect(run.plan[0].status).toBe("done");
  });

  it("interleaves timeline events and chat messages chronologically", async () => {
    seedCoreAssessment();
    core.messages.push({
      message_id: "msg-1",
      sequence_no: 1,
      role: "user",
      content_masked: "Start scan on api.target.example",
      created_at: "2026-11-12T08:02:30Z",
      session_id: "session-api-1",
    });

    const lib = await loadApiLibrary();
    const run = lib.assessments[0];
    expect(run.timeline.length).toBeGreaterThanOrEqual(3);
    const types = run.timeline.map((t) => t.type);
    expect(types).toContain("chat");
    expect(types).toContain("activity");
  });
});

describe("Home page data source", () => {
  it("renders with Core API data when Core API is running", async () => {
    seedCoreAssessment();
    const page = await Home({ searchParams: Promise.resolve({}) });

    expect(page).toBeDefined();
    expect(page.props).toBeDefined();

    // TopBar items should be derived from Core API assessment
    const topBar = page.props.topBar;
    expect(topBar.props.items).toHaveLength(1);
    expect(topBar.props.items[0].coreId).toBe(ASSESSMENT_UUID);
    expect(topBar.props.items[0].id).toBe("ENG-API-001");

    // Overview should have overall cards (mode: "all") for the Core API run
    expect(page.props.overview).toBeDefined();
    expect(page.props.overview.props.cards.mode).toBe("all");

    // Assessments view data should hold 1 row
    expect(page.props.assessments).toBeDefined();
    const rows = page.props.assessments.props.initial ?? page.props.assessments.props.data.rows;
    expect(rows).toHaveLength(1);
  });

  it("selects assessment by Core API UUID (?assessment=<uuid>)", async () => {
    seedCoreAssessment();
    const page = await Home({
      searchParams: Promise.resolve({ assessment: ASSESSMENT_UUID }),
    });

    // When an assessment is chosen, overview switches to run mode
    expect(page.props.overview.props.cards.mode).toBe("run");
    const topBar = page.props.topBar;
    expect(topBar.props.dash.assessment.target).toBe("https://api.target.example");
  });

  it("selects assessment by UID (?uid=<uid>) and scopes Findings and Reports to its Core API UUID", async () => {
    seedCoreAssessment();
    const lib = await loadApiLibrary();
    const uid = lib.assessments[0].uid;

    const page = await Home({
      searchParams: Promise.resolve({ uid }),
    });

    expect(page.props.overview.props.cards.mode).toBe("run");
    const topBar = page.props.topBar;
    expect(topBar.props.dash.assessment.target).toBe("https://api.target.example");
    expect(page.props.findings.props.children.props.assessmentId).toBe(ASSESSMENT_UUID);
    expect(page.props.findings.props.children.props.savedRun).toBeNull();
    expect(page.props.reports.props.children.props.assessmentId).toBe(ASSESSMENT_UUID);
  });

  it("keeps Findings and Reports unscoped when a local-only saved run has no Core API UUID", async () => {
    process.env.RECONIX_MOCK = "1";
    const page = await Home({
      searchParams: Promise.resolve({ uid: "20261003-101500-3ceb_RCX-DEMO-001" }),
    });

    expect(page.props.findings.props.children.props.assessmentId).toBeNull();
    expect(page.props.findings.props.children.props.savedRun).toBe("20261003-101500-3ceb_RCX-DEMO-001");
    expect(page.props.reports.props.children.props.assessmentId).toBeNull();
  });

  it("defaults to All assessments in the header when opening the Assessments view", async () => {
    seedCoreAssessment();
    const lib = await loadApiLibrary();
    const uid = lib.assessments[0].uid;

    const page = await Home({
      searchParams: Promise.resolve({ view: "assessments", uid }),
    });

    expect(page.props.topBar.props.dash).toBeNull();
    expect(page.props.topBar.props.overall).not.toBeNull();
  });

  it("falls back to local files when RECONIX_MOCK=1", async () => {
    process.env.RECONIX_MOCK = "1";
    seedCoreAssessment(); // Core API has 1 assessment, but mock mode must bypass it

    const page = await Home({ searchParams: Promise.resolve({}) });
    const topBar = page.props.topBar;

    // Sample-data directory has 11 sample runs, not the 1 from Core API
    expect(topBar.props.items.length).toBeGreaterThan(1);
    expect(topBar.props.items.every((i: { coreId?: string }) => !i.coreId)).toBe(true);
  });

  it("falls back to local files when Core API is down", async () => {
    process.env.RECONIX_CORE_API = "http://127.0.0.1:59999"; // unreachable port

    const page = await Home({ searchParams: Promise.resolve({}) });
    const topBar = page.props.topBar;

    // Falls back to sample-data files
    expect(topBar.props.items.length).toBeGreaterThan(1);
  });
});

describe("loadAssessment", () => {
  it("resolves Core API assessments by UID", async () => {
    seedCoreAssessment();
    const lib = await loadApiLibrary();
    const uid = lib.assessments[0].uid;

    const loaded = await loadAssessment(uid);
    expect(loaded).not.toBeNull();
    expect(loaded?.core_id).toBe(ASSESSMENT_UUID);
  });

  it("returns null for invalid UID format", async () => {
    expect(await loadAssessment("invalid-uid")).toBeNull();
  });
});
