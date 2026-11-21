// A stand-in for the local Core API, for the e2e tests (playwright.config.ts starts it). It serves
// the sample runs (sample-data/) in the API's own shapes (docs/openapi.json: SessionCreated,
// AssessmentRowOut, FindingOut, the error shape), so the Findings view shows the same findings
// the specs read from the files (e2e/support.ts `sample()`):
//   POST /api/v1/sessions                 a token (any body with interface "web")
//   GET  /api/v1/assessments              one row per sample run, newest first (as store.ts sorts)
//   GET  /api/v1/findings[?assessment_id] their findings, the informational ones left out
//   GET  /api/v1/assessments/{id}/overview its counts (AssessmentOverviewOut)
//   GET  /api/v1/assessments/{id}/reports  one report for a run that got that far (reportOf)
//   GET  /api/v1/reports/{id}/download     a small fake file, once READY and signed off
// and what the AI Assistant needs from the API:
//   sessions (one per conversation): open, list, read, messages, agent-runs, resume, close
//   POST /api/v1/sessions/{id}/chat/stream  asks the active provider's model (e2e/llm-stub.mjs)
//        as the real API's agent does, and streams it as PIECE, then DONE (or ERROR); the ask
//        is an agent run (GET .../agent-runs) and carries on, saved, when the client leaves
//   /api/v1/llm-providers: list, add, change, delete, activate, test, models (an address the
//        real API refuses is refused here too, in its words)
//   GET  /api/v1/assessments/{id}/actions|timeline, /api/v1/approvals
// Every call but opening a session needs a token it issued (401 INVALID_TOKEN otherwise).
// Test code only.
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiId } from "./core-api-ids.mjs";

const port = Number(process.env.CORE_API_STUB_PORT || 3193);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sample-data");
const SESSION_ID = "00000000-0000-4000-8000-0000000000e2";
const tokens = new Map(); // token -> session id
const sessions = new Map(); // session id -> SessionRead
const messages = []; // MessageOut, every session
const providers = []; // LlmProviderOut
const knowledgeAddOns = []; // { row: KnowledgeAddOnOut, passages: string[] }, oldest first (see knowledge())
const agentRuns = []; // AgentRunOut of every chat ask, oldest first
/** What GET /llm-providers/{id}/models answers for a cloud service. */
const CLOUD_MODELS = ["gpt-4.1", "gpt-4o", "gpt-4o-mini"];

const isInfo = (f) => [f.severity, f.severity_override ?? "", f.effective_severity ?? ""].some((s) => s.trim().toUpperCase() === "INFO");
const TRIAGE = { open: "OPEN", fixed: "FIXED", "false-positive": "FALSE_POSITIVE" };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const runs = readdirSync(dir)
  .filter((n) => n.endsWith(".json"))
  .map((n) => JSON.parse(readFileSync(path.join(dir, n), "utf8")))
  .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.uid.localeCompare(a.uid));

function findingOut(a, f, i) {
  const id = apiId(a.uid);
  const cwe = f.cwe?.length ? f.cwe : (f.references ?? []).filter((r) => /^CWE-\d+$/.test(r));
  return {
    finding_id: `${id.slice(0, 24)}${String(i).padStart(12, "0")}`,
    assessment_id: id,
    code: /^\d+$/.test(f.id) ? `F-${f.id}` : f.id,
    title: f.title,
    target: f.affected_url || f.path || "",
    description: f.description ?? "",
    severity_status: f.effective_severity || f.severity_override || f.severity,
    cvss_score: f.cvss_score > 0 ? String(f.cvss_score) : null,
    cwe_ids: cwe,
    owasp_id: f.owasp ?? [],
    cve_ids: f.cve ?? [],
    impact: f.impact || null,
    remediation: (f.remediation ?? "").split(/;\s+/).map((r) => r.trim()).filter(Boolean).map(cap).join("\n") || null,
    validation_status: f.validation || "UNCONFIRMED",
    // a CONFIRMED sample finding is one the API's validator classified (FindingOut's validated_*
    // fields, unchanged from the scanner's); the rest are not classified yet (null)
    ...(f.validation === "CONFIRMED"
      ? {
          finding_category: "CONFIRMED_VULNERABILITY",
          validated_severity_status: f.effective_severity || f.severity_override || f.severity,
          validated_cvss_score: f.cvss_score > 0 ? String(f.cvss_score) : null,
          validated_cwe_ids: cwe,
          validated_cve_ids: f.cve ?? [],
        }
      : { finding_category: null }),
    finding_status: TRIAGE[f.status] ?? "OPEN",
    triage_note: f.triage_note ?? null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: a.created_at,
    latest_validation: null,
    source_tool_run_ids: [],
    tools: f.tool ? [f.tool] : [],
    evidence: (f.evidence ?? []).map((text, n) => ({
      evidence_id: `${id.slice(0, 24)}${String(i * 100 + n).padStart(12, "0")}`,
      kind: "TEXT",
      content: text,
      location: null,
      created_at: a.created_at,
      tool_run_id: SESSION_ID,
    })),
  };
}

const findings = runs.flatMap((a) => a.findings.filter((f) => !isInfo(f)).map((f, i) => findingOut(a, f, i)));

function createdAtOf(a) {
  const m = a.uid.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  return a.created_at;
}

function statusMap(status) {
  if (status === "Completed") return "COMPLETED";
  if (status === "Stopped") return "CANCELLED";
  if (status === "New") return "DRAFT";
  return "ACTIVE";
}

function actionsOf(a) {
  const runId = apiId(a.uid);
  return (a.plan ?? []).map((p, idx) => {
    const actId = `${runId.slice(0, 24)}${String(idx).padStart(12, "0")}`;
    const stepMap = { done: "COMPLETED", active: "APPROVED", pending: "PENDING" };
    const waitingApp = a.approvals?.find((app) => app.request_id === a.waiting_request_id);
    const isStepWaiting = (p.status === "active" || (!a.plan.some((x) => x.status === "active") && p.status === "pending")) && waitingApp;
    return {
      action_id: actId,
      tool: p.label || p.key,
      args: [],
      target: a.target || "",
      purpose: p.label,
      risk_level: isStepWaiting ? waitingApp?.risk || null : null,
      action_status: stepMap[p.status] ?? "PENDING",
      guardrail_report: {},
      created_at: a.created_at,
      approval_id: isStepWaiting ? waitingApp.request_id : null,
      tool_runs: [{ request_count: 1 }],
    };
  });
}

function approvalsOf(a) {
  const actions = actionsOf(a);
  return (a.approvals ?? []).map((app, idx) => {
    const dec = a.decisions?.find((d) => d.request_id === app.request_id);
    const matchedAct = actions.find((act) => act.approval_id === app.request_id) || actions[Math.min(idx, Math.max(0, actions.length - 1))];
    const isWaiting = a.status === "Awaiting input" && a.waiting_request_id === app.request_id;
    return {
      approval_id: app.request_id,
      kind: "action",
      subject_snapshot: { action: app.action, tool: app.action, target: app.target || "" },
      subject_hash: app.command_hash || "",
      risk_level: app.risk || "MEDIUM",
      approval_status: dec ? dec.decision : isWaiting ? "PENDING" : "REJECTED",
      reason: app.purpose || null,
      decided_by: dec ? dec.operator : null,
      decided_at: dec ? dec.at : null,
      action_id: matchedAct ? matchedAct.action_id : null,
    };
  });
}

function sessionId(s) {
  const h = createHash("sha1").update(`reconix-session:${s}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

for (const a of runs) {
  const sid = sessionId(a.session || a.uid);
  if (!sessions.has(sid)) {
    sessions.set(sid, {
      session_id: sid,
      session_status: "ACTIVE",
      interface: "web",
      created_by: "tester@lab",
      created_at: a.created_at,
      updated_at: a.saved_at || a.created_at,
      closed_at: null,
    });
  }
}

const sampleMessages = runs.flatMap((a) => {
  const sid = sessionId(a.session || a.uid);
  return (a.timeline ?? [])
    .filter((e) => e.type === "chat")
    .map((e, idx) => ({
      message_id: `${apiId(a.uid).slice(0, 24)}${String(idx).padStart(12, "0")}`,
      session_id: sid,
      sequence_no: e.seq || idx + 1,
      role: e.who === "you" ? "user" : "assistant",
      content_masked: e.text,
      created_at: e.at || a.created_at,
    }));
});
messages.push(...sampleMessages);

const assessments = runs.map((a) => {
  const mine = findings.filter((f) => f.assessment_id === apiId(a.uid) && f.finding_status !== "FALSE_POSITIVE");
  const isAwaiting = a.status === "Awaiting input";
  return {
    assessment_id: apiId(a.uid),
    engagement_code: a.label || a.assessment_id || a.uid,
    name: a.template?.name || a.label || a.uid,
    type: a.target_kind || a.template?.id || "WEB",
    assessment_status: statusMap(a.status),
    created_by: "tester@lab",
    created_at: createdAtOf(a),
    updated_at: a.saved_at || a.created_at,
    session_id: sessionId(a.session || a.uid),
    targets: a.target ? [a.target] : [],
    finding_count: mine.length,
    worst_severity: mine[0]?.severity_status ?? null,
    pending_approval_count: isAwaiting ? 1 : 0,
    plan_step_count: a.plan?.length ?? 5,
    plan_step_done_count: a.plan?.filter((p) => p.status === "done").length ?? 2,
    last_activity_at: a.saved_at || a.created_at,
  };
});
const allApprovals = runs.flatMap((a) => approvalsOf(a));

const SEVERITY = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN", "NONE"];
const byId = new Map(runs.map((a) => [apiId(a.uid), a]));

function overviewOf(a) {
  const row = assessments.find((r) => r.assessment_id === apiId(a.uid));
  const mine = findings.filter((f) => f.assessment_id === row.assessment_id);
  const counted = mine.filter((f) => f.finding_status !== "FALSE_POSITIVE");
  const tally = (key, values) => Object.fromEntries(values.map((v) => [v, counted.filter((f) => f[key] === v).length]));
  return {
    assessment: { assessment_id: row.assessment_id, engagement_code: row.engagement_code, name: row.name, type: row.type, assessment_status: row.assessment_status, created_by: row.created_by, created_at: row.created_at, updated_at: row.updated_at, session_id: row.session_id },
    targets: row.targets,
    finding_count: counted.length,
    findings_by_severity: tally("severity_status", SEVERITY),
    findings_by_validation: tally("validation_status", ["CONFIRMED", "UNCONFIRMED", "INCONCLUSIVE"]),
    findings_by_status: Object.fromEntries(["OPEN", "FALSE_POSITIVE", "FIXED"].map((v) => [v, mine.filter((f) => f.finding_status === v).length])),
    actions_by_status: {},
    plan_step_count: a.plan.length,
    plan_step_done_count: a.plan.filter((p) => p.status === "done").length,
    tool_run_count: a.timeline.filter((e) => e.type === "activity" && e.who === "TOOL").length,
    request_count: a.requests?.length ?? a.run?.requests ?? 0,
    masked_count: 0,
    pending_approval_count: row.pending_approval_count,
    first_started_at: a.run?.started_at || a.created_at,
    last_finished_at: a.run?.finished_at || null,
    duration_seconds: 0,
    time_window_seconds: a.scope?.time_limit_minutes ? a.scope.time_limit_minutes * 60 : null,
    over_time_window: false,
  };
}

/** A Completed run has a signed-off report; a Running or waiting one a report whose review is
    pending; a Stopped one none. The newest run has LONG versions (newest first), so its Report
    view is longer than a screen (e2e/scroll.spec.ts scrolls it). */
export const LONG = 12;
function reportOf(a) {
  if (a.status === "Stopped") return [];
  const id = apiId(a.uid);
  const done = a.status === "Completed";
  const count = a === runs[0] ? LONG : 1;
  return Array.from({ length: count }, (_, n) => count - n).map((version) => (
    {
      report_id: `${id.slice(0, 24)}${String(version).padStart(12, "f")}`,
      version,
      report_status: "READY",
      executive_summary: `${a.label}: ${a.findings.length} findings recorded.`,
      methodology: null,
      snapshot_hash: "0".repeat(64),
      formats: ["PDF", "DOCX", "JSON"],
      generated_by: "tester@lab",
      generated_at: a.saved_at || a.created_at,
      created_at: a.created_at,
      assessment_id: id,
      assessment_ids: [id],
      review_approval_id: SESSION_ID,
      review_status: done ? "APPROVED" : "PENDING",
      signed_off: done,
    }
  ));
}
const reports = runs.flatMap(reportOf);
const FILES = { PDF: ["application/pdf", "pdf", "%PDF-1.4 e2e fake"], DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", "PK e2e fake"], JSON: ["application/json", "json", '{"fake":true}'] };

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const refuse = (res, status, code, message) => send(res, status, { code, message, details: {} });

/** Why the real API refuses a provider's address (422 PROVIDER_URL_NOT_ALLOWED), in its words,
    or null: core/provider_urls.py `check`, with reconix_ai/providers/base_url.py's rules. */
function urlProblem(raw) {
  if (/[\s\x00-\x1f\x7f]/.test(raw)) return "The address must not contain spaces or control characters.";
  let u;
  try {
    u = new URL(raw);
  } catch {
    return "The address is not a valid URL.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "The address must start with http:// or https://.";
  if (u.username || u.password) return "The address must not contain a user name or password.";
  if (!["", "/v1", "/api/v1"].includes(u.pathname.replace(/\/+$/, "")) || u.search || u.hash) return "The address must not have a path (except /v1 or /api/v1), query or fragment.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const local = ["localhost", "ollama", "qdrant", "embeddings", "host.docker.internal", "::1"].includes(host) || /^127\./.test(host);
  if (u.protocol === "http:" && !local) return "Plain http is only allowed to this computer; use https.";
  return null;
}
const now = () => new Date().toISOString();

function open(iface) {
  const session = { session_id: randomUUID(), interface: iface, session_status: "ACTIVE", created_at: now(), closed_at: null };
  sessions.set(session.session_id, session);
  const token = `e2e-core-token-${randomUUID()}`;
  tokens.set(token, session.session_id);
  return { ...session, token };
}

function save(sessionId, role, content) {
  const sequence_no = messages.filter((m) => m.session_id === sessionId).length + 1;
  const message = { message_id: randomUUID(), sequence_no, role, content_masked: content, created_at: now(), session_id: sessionId };
  messages.push(message);
  return message;
}


/** Ask the active provider's model, as the real API's agent does, and stream its words. */
async function chat(res, sessionId, content, assessmentId) {
  const active = providers.find((p) => p.is_active);
  if (!active) return refuse(res, 503, "NO_ACTIVE_PROVIDER", "Choose a model first.");
  const earlier = messages.filter((m) => m.session_id === sessionId).map((m) => ({ role: m.role, content: m.content_masked }));
  const message = save(sessionId, "user", content);
  // the ask is an agent run: RUNNING while the model writes, then COMPLETED or FAILED
  const run = {
    agent_run_id: randomUUID(),
    agent_runs_status: "RUNNING",
    model_name: active.model_name,
    plan: null,
    started_at: now(),
    finished_at: null,
    session_id: sessionId,
    assessment_id: assessmentId,
  };
  agentRuns.push(run);
  // a question about one assessment (ChatIn.assessment_id) puts only that one in front of the model
  const about = assessmentId ? assessments.filter((a) => a.assessment_id === assessmentId) : assessments;
  const system = `You answer questions about the assessments. ALL SAVED ASSESSMENTS: ${about.length}`;
  const event = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  let upstream;
  try {
    upstream = await fetch(`${active.base_url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: active.model_name, stream: true, messages: [{ role: "system", content: system }, ...earlier, { role: "user", content }] }),
    });
  } catch {
    upstream = null;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  if (!upstream || !upstream.ok || !upstream.body) {
    run.agent_runs_status = "FAILED";
    run.finished_at = now();
    event("ERROR", { code: "MODEL_UNAVAILABLE", message: "The model did not answer.", details: {} });
    return res.end();
  }
  let text = "";
  let buffer = "";
  // leaving early only stops the events: the ask carries on and its answer is saved, as the real
  // API's (services/chat.py stream_events)
  const send = (name, data) => {
    if (!res.destroyed && !res.writableEnded) event(name, data);
  };
  for await (const piece of upstream.body) {
    buffer += Buffer.from(piece).toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const words = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? "";
      if (!words) continue;
      text += words;
      send("PIECE", { text: words });
    }
  }
  // no text at all: the real API's provider client refuses it (EMPTY_RESPONSE,
  // reconix_ai/providers/client.py), so the stream ends with ERROR and no answer is saved
  if (!text.trim()) {
    run.agent_runs_status = "FAILED";
    run.finished_at = now();
    send("ERROR", { code: "EMPTY_RESPONSE", message: "The model sent back an empty answer.", details: {} });
    if (!res.writableEnded) res.end();
    return;
  }
  const reply = save(sessionId, "assistant", text);
  // the knowledge it cites, on the DONE event and kept on the saved answer (services/chat.py)
  const sources = knCited(content);
  reply.sources = sources;
  run.agent_runs_status = "COMPLETED";
  run.finished_at = now();
  send("DONE", { message, reply, agent_run_id: run.agent_run_id, sources });
  if (!res.writableEnded) res.end();
}

async function provider(req, res, url, body, rest, row) {
  const m = req.method;
  if (m === "PATCH" && rest === "") {
    const refused = body.base_url ? urlProblem(body.base_url) : null;
    if (refused) return refuse(res, 422, "PROVIDER_URL_NOT_ALLOWED", refused);
    for (const key of ["display_name", "model_name", "base_url"]) if (key in body) row[key] = body[key];
    if ("api_key" in body) row.api_key_last4 = body.api_key ? String(body.api_key).slice(-4) : null;
    row.updated_at = now();
    return send(res, 200, row);
  }
  if (m === "DELETE" && rest === "") {
    // the real API removes the active row too and leaves no model active
    providers.splice(providers.indexOf(row), 1);
    res.writeHead(204);
    return res.end();
  }
  if (m === "POST" && rest === "/activate") {
    for (const p of providers) p.is_active = p === row;
    return send(res, 200, { llm_provider: row, approval: null });
  }
  if (m === "POST" && rest === "/test") {
    const ok = await fetch(`${row.base_url}/models`).then((r) => r.ok).catch(() => false);
    return send(res, 200, { ok, model_name: row.model_name, latency_ms: 5, code: ok ? null : "MODEL_UNAVAILABLE", message: ok ? null : "The model did not answer." });
  }
  if (m === "GET" && rest === "/models") {
    if (["OPENAI", "ANTHROPIC", "DEEPSEEK"].includes(row.provider_type)) return send(res, 200, { models: CLOUD_MODELS });
    const listed = await fetch(`${row.base_url}/models`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!listed) return refuse(res, 503, "MODEL_UNAVAILABLE", "The server did not answer with its models.");
    return send(res, 200, { models: listed.data.map((d) => d.id) });
  }
  return refuse(res, 404, "NOT_FOUND", "Not found.");
}

async function handle(req, res, raw) {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const m = req.method;
  const p = url.pathname.replace(/^\/api\/v1/, "");
  const multipart = /^multipart\/form-data/i.test(req.headers["content-type"] ?? "");
  const body = raw.length && !multipart ? JSON.parse(raw.toString("utf8")) : {};
  if (m === "GET" && url.pathname === "/") return send(res, 200, { status: "OK" }); // Playwright's ready check
  if (m === "POST" && p === "/sessions") return send(res, 201, open(body.interface ?? "web"));
  // test only: forget every provider, as a fresh API has none (e2e/models.ts clearModels)
  if (m === "POST" && url.pathname === "/__e2e/reset-providers") {
    providers.length = 0;
    return send(res, 200, { ok: true });
  }
  if (m === "POST" && p === "/sessions/web-sign-in") return refuse(res, 401, "INVALID_SIGN_IN_CODE", "The sign-in code is not valid.");
  const me = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  if (!me) return refuse(res, 401, "INVALID_TOKEN", "The session token is not valid.");

  if (m === "GET" && p === "/sessions") {
    const want = (key, value) => !url.searchParams.get(key) || url.searchParams.get(key) === value;
    return send(res, 200, [...sessions.values()].filter((s) => want("interface", s.interface) && want("session_status", s.session_status)).reverse());
  }
  let hit = p.match(/^\/sessions\/([^/]+)(\/.*)?$/);
  if (hit) {
    const [, id, rest = ""] = hit;
    const session = sessions.get(id);
    if (!session) return refuse(res, 404, "SESSION_NOT_FOUND", "No session has this id.");
    if (m === "GET" && rest === "") return send(res, 200, session);
    if (m === "GET" && rest === "/messages") return send(res, 200, messages.filter((x) => x.session_id === id));
    if (m === "GET" && rest === "/agent-runs") return send(res, 200, agentRuns.filter((r) => r.session_id === id).reverse());
    if (m === "POST" && rest === "/resume") {
      if (session.session_status === "CLOSED") return refuse(res, 409, "SESSION_CLOSED", "This session is already closed.");
      const token = `e2e-core-token-${randomUUID()}`;
      tokens.set(token, id);
      return send(res, 201, { ...session, token });
    }
    if (m === "POST" && rest === "/close") {
      if (id !== me) return refuse(res, 403, "NOT_YOUR_SESSION", "You can only close your own session.");
      Object.assign(session, { session_status: "CLOSED", closed_at: now() });
      return send(res, 200, session);
    }
    if (m === "POST" && rest === "/chat/stream") {
      if (id !== me) return refuse(res, 403, "NOT_YOUR_SESSION", "You can only write in your own session.");
      return chat(res, id, String(body.content ?? ""), body.assessment_id ?? null);
    }
  }

  if (m === "GET" && p === "/assessments") return send(res, 200, assessments);
  hit = p.match(/^\/assessments\/([^/]+)\/(overview|reports|actions|timeline)$/);
  if (m === "GET" && hit) {
    const a = byId.get(hit[1]);
    if (!a) return refuse(res, 404, "ASSESSMENT_NOT_FOUND", "No assessment with this id.");
    if (hit[2] === "overview") return send(res, 200, overviewOf(a));
    if (hit[2] === "reports") return send(res, 200, reportOf(a));
    if (hit[2] === "actions") return send(res, 200, actionsOf(a));
    const events = (a.timeline ?? []).map((e) => ({
      event_type: e.type === "activity" ? (e.who === "TOOL" ? "TOOL_RUN_COMPLETED" : "FINDING_CREATED") : "LOG_INFO",
      at: e.at || a.created_at,
      actor: e.who || "SYSTEM",
      details: { target: a.target || "" },
    }));
    return send(res, 200, { events, has_older: false });
  }
  hit = p.match(/^\/reports\/([^/]+)\/download$/);
  if (m === "GET" && hit) {
    const r = reports.find((x) => x.report_id === hit[1]);
    if (!r) return refuse(res, 404, "REPORT_NOT_FOUND", "No report with this id.");
    // the format first, as the API's query validation answers before the handler runs
    const [type, ext, file] = FILES[url.searchParams.get("format") || "PDF"] ?? [];
    if (!type) return refuse(res, 422, "VALIDATION_ERROR", "Unknown format.");
    if (!r.signed_off) return refuse(res, 409, "REPORT_NOT_SIGNED_OFF", "A person must approve the review first.");
    const code = assessments.find((x) => x.assessment_id === r.assessment_id).engagement_code;
    res.writeHead(200, { "Content-Type": type, "Content-Disposition": `attachment; filename="${code}-v${r.version}.${ext}"` });
    return res.end(file);
  }
  if (m === "GET" && p === "/findings") {
    const id = url.searchParams.get("assessment_id");
    return send(res, 200, id ? findings.filter((f) => f.assessment_id === id) : findings);
  }
  if (m === "GET" && p === "/approvals") {
    const status = url.searchParams.get("status");
    if (status) return send(res, 200, allApprovals.filter((a) => a.approval_status === status));
    return send(res, 200, allApprovals);
  }
  if (p === "/knowledge-add-ons" || p.startsWith("/knowledge-add-ons/") || p.startsWith("/knowledge/")) return knowledge(req, res, url, p, raw);

  if (m === "GET" && p === "/llm-providers") return send(res, 200, providers);
  if (m === "POST" && p === "/llm-providers") {
    const refused = body.base_url ? urlProblem(body.base_url) : null;
    if (refused) return refuse(res, 422, "PROVIDER_URL_NOT_ALLOWED", refused);
    const local = body.provider_type === "OLLAMA" || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(body.base_url ?? "");
    const row = {
      llm_provider_id: randomUUID(),
      provider_type: body.provider_type,
      display_name: body.display_name,
      base_url: body.base_url ?? null,
      api_key_last4: body.api_key ? String(body.api_key).slice(-4) : null,
      model_name: body.model_name,
      is_active: false,
      is_local: local,
      archived_at: null,
      created_by: "tester@lab",
      created_at: now(),
      updated_at: now(),
    };
    providers.push(row);
    return send(res, 201, row);
  }
  hit = p.match(/^\/llm-providers\/([^/]+)(\/.*)?$/);
  if (hit) {
    const row = providers.find((x) => x.llm_provider_id === hit[1]);
    if (!row) return refuse(res, 404, "LLM_PROVIDER_NOT_FOUND", "No provider has this id.");
    return provider(req, res, url, body, hit[2] ?? "", row);
  }
  refuse(res, 404, "NOT_FOUND", "Not found.");
}

// ---- Knowledge add-ons (services/api api/knowledge_add_ons.py, api/knowledge.py) ----
//   GET    /knowledge-add-ons                  every add-on, oldest first (KnowledgeAddOnOut)
//   POST   /knowledge-add-ons                  multipart: file, interface (web|cli), name?, ingest_now?
//   DELETE /knowledge-add-ons[/{id}]           all (KnowledgeAddOnsCleared), or one (204)
//   GET    /knowledge-add-ons/{id}/references  what it names (KnowledgeAddOnReferencesOut)
//   GET    /knowledge-add-ons/{id}/passages    a page of its passages, with spans
//   GET    /knowledge/search                   the ingested add-ons' passages sharing a word with q
//   GET|POST /knowledge/reingest               the job: RUNNING when started, done at the next read
// The text is read as the API reads it (core/knowledge_files.py) for TXT, MD, JSON and YAML; a
// PDF's text is its uncompressed `(...) Tj` strings (all the e2e PDFs hold); a DOCX is not read.
// The stub has no built-in knowledge (CVE, CWE, ...) and masks nothing. No copy of a file is kept.
const KN_KINDS = { ".txt": "TXT", ".md": "MD", ".json": "JSON", ".yaml": "YAML", ".yml": "YAML", ".docx": "DOCX", ".pdf": "PDF" };
const KN_MAX_FILE = 10 * 1024 * 1024;
const KN_MAX_BODY = KN_MAX_FILE + 64 * 1024;
const KN_MAX_ADD_ONS = 50;
const KN_CHARS = 1200; // reconix_ai/knowledge/add_ons.py MAX_CHARS, OVERLAP, MAX_PASSAGES
const KN_OVERLAP = 150;
const KN_MAX_PASSAGES = 2000;
const KN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reingest = { status: "IDLE", scope: "ALL", step: null, public_pieces: 0, add_ons_done: 0, add_ons_total: 0, new_ingested: 0, started_at: null, finished_at: null, error_code: null, error_message: null };

class KnRefused extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
const knFormError = (field, message) => new KnRefused(422, "VALIDATION_ERROR", "The request is not valid.", { fields: [{ field: `body.${field}`, message }] });
const knBase = (name) => name.replace(/\\/g, "/").split("/").pop();

function knKind(fileName) {
  const base = knBase(fileName);
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  if (ext === ".doc") throw new KnRefused(422, "UNSUPPORTED_FILE_TYPE", "Save it as .docx first (old .doc files aren't supported).");
  if (!KN_KINDS[ext]) throw new KnRefused(422, "UNSUPPORTED_FILE_TYPE", "Use one of these file types: .txt .md .json .yaml .yml .docx .pdf.");
  return KN_KINDS[ext];
}

function knText(kind, bytes) {
  if (bytes.length > KN_MAX_FILE) throw new KnRefused(413, "FILE_TOO_LARGE", "That file is over 10 MB.");
  const text = bytes.toString("utf8");
  if (kind === "JSON") {
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      throw new KnRefused(422, "FILE_UNREADABLE", "That file isn't valid JSON.");
    }
  }
  if (kind === "PDF") return [...bytes.toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((x) => x[1]).join("\n\n");
  if (kind === "DOCX") throw new KnRefused(422, "FILE_UNREADABLE", "Couldn't read that Word file.");
  return text;
}

/** split_passages: paragraphs packed up to KN_CHARS, the next starting with the last one's tail. */
function knPassages(text) {
  const windows = (para) => {
    const out = [];
    for (let start = 0; start < para.length; ) {
      let end = Math.min(start + KN_CHARS, para.length);
      if (end < para.length) {
        const space = para.lastIndexOf(" ", end - 1);
        if (space >= start + KN_CHARS - KN_OVERLAP) end = space;
      }
      out.push(para.slice(start, end).trim());
      if (end >= para.length) break;
      start = Math.max(end - KN_OVERLAP, start + 1);
    }
    return out.filter(Boolean);
  };
  const units = text.split(/\n\s*\n/).map((b) => b.trim()).flatMap((b) => (b.length > KN_CHARS ? windows(b) : b ? [b] : []));
  const tail = (passage) => {
    const t = passage.slice(-KN_OVERLAP);
    const m = /\s/.exec(t);
    return (m && m.index + 1 < t.length ? t.slice(m.index + 1) : t).trim();
  };
  const passages = [];
  let current = "";
  for (const unit of units) {
    const joined = current ? `${current}\n\n${unit}` : unit;
    if (joined.length <= KN_CHARS) {
      current = joined;
      continue;
    }
    if (current) {
      passages.push(current);
      if (passages.length >= KN_MAX_PASSAGES) return passages;
      const t = tail(current);
      const start = t ? `${t}\n\n${unit}` : unit;
      current = start.length <= KN_CHARS ? start : unit;
    } else current = unit;
  }
  if (current && passages.length < KN_MAX_PASSAGES) passages.push(current);
  return passages;
}

/** Where a passage names a reference or topic (services/knowledge_references.py, the exact ids
    and a few of its topics). */
const KN_PATTERNS = [
  ["CVE", /\bCVE-\d{4}-\d{4,7}\b/gi, (s) => s.toUpperCase(), (id) => id],
  ["CWE", /\bCWE[-\s]?\d{1,4}\b/gi, (s) => `CWE-${s.match(/\d+/)[0]}`, (id) => id],
  ["OWASP", /\b(?:A(?:0[1-9]|10):20(?:17|21)|API(?:[1-9]|10):(?:2019|2023))\b/g, (s) => s, (id) => id],
  ["ATTACK", /\bT1\d{3}(?:\.\d{3})?\b/g, (s) => s, (id) => id],
  ["TOPIC", /\b(?:sql injection|sqli)\b/gi, () => "sql-injection", () => "SQL injection"],
  ["TOPIC", /\b(?:cross-site scripting|xss)\b/gi, () => "cross-site-scripting", () => "Cross-site scripting"],
  ["TOPIC", /\b(?:encryption|tls|certificate)\b/gi, () => "cryptography", () => "Cryptography"],
];
function knSpans(text) {
  const spans = KN_PATTERNS.flatMap(([type, re, id]) => [...text.matchAll(re)].map((x) => ({ type, ref_id: id(x[0]), start: x.index, end: x.index + x[0].length })));
  return spans.sort((a, b) => a.start - b.start);
}
function knReferences(passages) {
  const counts = new Map();
  for (const text of passages) {
    for (const s of new Map(knSpans(text).map((s) => [`${s.type}:${s.ref_id}`, s])).values()) {
      const label = KN_PATTERNS.find(([type, , id]) => type === s.type && id(text.slice(s.start, s.end)) === s.ref_id)[3](s.ref_id);
      const key = `${s.type}:${s.ref_id}`;
      counts.set(key, { type: s.type, ref_id: s.ref_id, label, count: (counts.get(key)?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 60);
}

/** POST /knowledge-add-ons: read the form after the size check, as the route does. */
async function knAdd(req, raw) {
  const length = req.headers["content-length"] ?? "";
  if (!/^\d+$/.test(length)) throw new KnRefused(411, "LENGTH_REQUIRED", "Send the upload with a Content-Length header.");
  if (Number(length) > KN_MAX_BODY) throw new KnRefused(413, "FILE_TOO_LARGE", "That file is over 10 MB.");
  const form = await new Request("http://stub/", { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: raw }).formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw knFormError("file", "Field required");
  const iface = form.get("interface");
  if (iface !== "web" && iface !== "cli") throw knFormError("interface", iface == null ? "Field required" : "Input should be 'web' or 'cli'");
  const name = form.get("name") || null;
  if (name && name.length > 255) throw knFormError("name", "String should have at most 255 characters");
  const ingestNow = !["false", "0", "no", "off"].includes(String(form.get("ingest_now") ?? "true").toLowerCase());
  // pick_kind: the file's own name decides; a name with no type (a pasted "blob") takes name's
  let kind;
  try {
    kind = knKind(file.name);
  } catch (error) {
    if (!name) throw error;
    kind = knKind(name);
  }
  if (knowledgeAddOns.length >= KN_MAX_ADD_ONS) throw new KnRefused(409, "KNOWLEDGE_ADD_ON_LIMIT", `The knowledge limit is ${KN_MAX_ADD_ONS} add-ons. Remove one first.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const passages = knPassages(knText(kind, bytes));
  if (!passages.length) throw new KnRefused(422, "FILE_HAS_NO_TEXT", "That file has no readable text to add.");
  const shown = [...knBase(name || file.name)].filter((ch) => !/[\p{Cc}\p{Cf}]/u.test(ch) || /\s/.test(ch)).join("").split(/\s+/).join(" ").trim();
  const row = {
    knowledge_add_on_id: randomUUID(),
    name: shown.slice(0, 120).trimEnd() || "untitled",
    kind,
    size_bytes: bytes.length,
    chunk_count: passages.length,
    interface: iface,
    created_at: now(),
    ingest_status: ingestNow ? "INGESTED" : "PENDING",
  };
  knowledgeAddOns.push({ row, passages });
  return { ...row, cut: passages.length >= KN_MAX_PASSAGES ? "PASSAGE_LIMIT" : null };
}

/** The ingested add-ons' passages that share a word of four letters or more with `q`. */
function knSearch(q, limit) {
  const words = new Set(q.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const hits = knowledgeAddOns
    .filter((a) => a.row.ingest_status === "INGESTED")
    .flatMap((a) =>
      a.passages.map((text, index) => {
        const shared = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).intersection(words).size;
        return { source: "USER_DOC", ref_id: a.row.knowledge_add_on_id, title: a.row.name, text: text.slice(0, 4000), url: "", section: `/Part ${index + 1}/`, score: shared };
      }),
    )
    .filter((h) => h.score > 0);
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The add-ons a chat answer cites (ChatOut.sources, SourceRef): as the real agent finds the
    knowledge for a question and cites what it used, a passage that shares a word with the
    question that no other add-on has (a rare word, not "the" or "keys"), one per add-on. */
function knCited(question) {
  const words = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const live = knowledgeAddOns.filter((a) => a.row.ingest_status === "INGESTED");
  const asked = words(question);
  return live.flatMap((a) => {
    const others = live.filter((b) => b !== a).flatMap((b) => b.passages.map(words));
    const index = a.passages.findIndex((text) => [...words(text).intersection(asked)].some((w) => !others.some((o) => o.has(w))));
    return index < 0 ? [] : [{ ref_id: a.row.knowledge_add_on_id, title: a.row.name, url: "", source: "USER_DOC", section: `/Part ${index + 1}/` }];
  });
}

async function knowledge(req, res, url, p, raw) {
  const m = req.method;
  try {
    if (p === "/knowledge-add-ons") {
      if (m === "GET") return send(res, 200, knowledgeAddOns.map((a) => a.row));
      if (m === "POST") return send(res, 201, await knAdd(req, raw));
      if (m === "DELETE") return send(res, 200, { removed_count: knowledgeAddOns.splice(0).length });
    }
    const hit = p.match(/^\/knowledge-add-ons\/([^/]+)(\/references|\/passages)?$/);
    if (hit) {
      if (!KN_UUID.test(hit[1])) throw new KnRefused(422, "VALIDATION_ERROR", "The request is not valid.", { fields: [{ field: "path.knowledge_add_on_id", message: "Input should be a valid UUID" }] });
      const at = knowledgeAddOns.findIndex((a) => a.row.knowledge_add_on_id === hit[1].toLowerCase());
      if (at < 0) throw new KnRefused(404, "KNOWLEDGE_ADD_ON_NOT_FOUND", "No knowledge add-on with this id.");
      const { passages } = knowledgeAddOns[at];
      if (m === "DELETE" && !hit[2]) {
        knowledgeAddOns.splice(at, 1);
        res.writeHead(204);
        return res.end();
      }
      if (m === "GET" && hit[2] === "/references") return send(res, 200, { knowledge_add_on_id: hit[1], references: knReferences(passages) });
      if (m === "GET" && hit[2] === "/passages") {
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 50);
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new KnRefused(422, "VALIDATION_ERROR", "The request is not valid.");
        const page = passages.slice(offset, offset + limit).map((text, i) => ({ index: offset + i, text, spans: knSpans(text) }));
        return send(res, 200, { knowledge_add_on_id: hit[1], total: passages.length, offset, passages: page });
      }
    }
    if (m === "GET" && p === "/knowledge/search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) throw new KnRefused(422, "VALIDATION_ERROR", "The request is not valid.", { fields: [{ field: "query.q", message: "must not be blank" }] });
      const sources = url.searchParams.getAll("source");
      const limit = Number(url.searchParams.get("limit") ?? 5);
      return send(res, 200, sources.length && !sources.includes("USER_DOC") ? [] : knSearch(q, limit));
    }
    if (p === "/knowledge/reingest" && m === "POST") {
      if (reingest.status === "RUNNING") throw new KnRefused(409, "REINGEST_RUNNING", "The knowledge is being re-ingested already.");
      const scope = url.searchParams.get("scope") === "NEW" ? "NEW" : "ALL";
      const total = knowledgeAddOns.filter((a) => scope === "ALL" || a.row.ingest_status === "PENDING").length;
      Object.assign(reingest, { status: "RUNNING", scope, step: scope === "ALL" ? "PUBLIC" : "ADD_ONS", public_pieces: 0, add_ons_done: 0, add_ons_total: total, new_ingested: 0, started_at: now(), finished_at: null, error_code: null, error_message: null });
      return send(res, 202, reingest);
    }
    if (p === "/knowledge/reingest" && m === "GET") {
      // the job runs in the background; here it has finished by the next read
      if (reingest.status === "RUNNING") {
        const waiting = knowledgeAddOns.filter((a) => a.row.ingest_status === "PENDING");
        for (const a of waiting) a.row.ingest_status = "INGESTED";
        Object.assign(reingest, { status: "COMPLETED", step: "ADD_ONS", add_ons_done: reingest.add_ons_total, new_ingested: waiting.length, finished_at: now() });
      }
      return send(res, 200, reingest);
    }
    return refuse(res, 404, "NOT_FOUND", "Not found.");
  } catch (error) {
    if (!(error instanceof KnRefused)) throw error;
    return send(res, error.status, { code: error.code, message: error.message, details: error.details });
  }
}

createServer((req, res) => {
  // the body as bytes: a knowledge upload is multipart with a binary file (a PDF) in it
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => handle(req, res, Buffer.concat(chunks)).catch(() => res.headersSent || refuse(res, 500, "STUB_ERROR", "The stub failed.")));
}).listen(port, "127.0.0.1");
