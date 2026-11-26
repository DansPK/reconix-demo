/* A stand-in Core API for the web's tests, in the exact response shapes of docs/openapi.json
   (SessionCreated, SessionRead, MessageOut, the chat stream's PIECE/DONE/ERROR events,
   LlmProviderOut, LlmProviderActivation, LlmProviderTestOut, the {code, message, details}
   error). Test code only: product code never imports it. It runs on a free 127.0.0.1 port. */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

type Session = { session_id: string; interface: string; session_status: string; created_at: string; closed_at: string | null };
type Message = { message_id: string; sequence_no: number; role: string; content_masked: string; created_at: string; session_id: string };
type Provider = Record<string, unknown> & { llm_provider_id: string; provider_type: string; base_url: string | null; model_name: string; is_active: boolean; is_local: boolean };

/** What a cloud provider's GET /llm-providers/{id}/models answers. */
export const CLOUD_MODELS = ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "whisper-1", "text-embedding-3-small", "dall-e-3", "omni-moderation-latest"];

export interface FakeCore {
  url: string;
  sessions: Map<string, Session>;
  tokens: Map<string, string>; // token -> session id
  messages: Message[];
  providers: Provider[];
  codes: Set<string>;
  calls: { method: string; path: string; body: unknown; token: string }[];
  /** What the agent answers (pieces, then the saved reply); `error` sends an ERROR event,
      `sources` the knowledge the answer cites (SourceRef rows on the DONE ChatOut). */
  agent: { pieces: string[]; reply?: string; error?: string; sources?: Record<string, unknown>[] };
  /** Session id -> the newest agent run's status (GET /sessions/{id}/agent-runs). */
  runs: Map<string, string>;
  /** GET /llm-providers/{id}/models answers 503 MODEL_UNAVAILABLE (the server is down). */
  listFails: boolean;
  /** The assessments the API holds, with what their routes answer (AssessmentRowOut,
      AssessmentOverviewOut, FindingOut[], ActionOut[], TimelineOut), and the approvals. */
  assessments: { row: Record<string, unknown>; overview: Record<string, unknown>; findings: unknown[]; actions: unknown[]; events: unknown[] }[];
  approvals: { approval_status: string; [key: string]: unknown }[];
  /** Knowledge add-ons (KnowledgeAddOnOut) with their references (KnowledgeReferenceOut). */
  addOns: { row: Record<string, unknown>; references: unknown[]; text: string }[];
  /** A re-ingest job is running (POST /knowledge/reingest answers 409). */
  reingesting: boolean;
  /** Forget every token, as an API restart does. */
  restart(): void;
  close(): Promise<void>;
}

const now = () => new Date().toISOString();
const MASKED = /sk-[A-Za-z0-9]{8,}/g;

export async function startFakeCore(): Promise<FakeCore> {
  const fake = {
    sessions: new Map<string, Session>(),
    tokens: new Map<string, string>(),
    messages: [] as Message[],
    providers: [] as Provider[],
    codes: new Set<string>(),
    calls: [] as FakeCore["calls"],
    agent: { pieces: ["Two ", "approvals"], reply: "Two approvals wait." } as FakeCore["agent"],
    runs: new Map<string, string>(),
    listFails: false,
    assessments: [] as FakeCore["assessments"],
    approvals: [] as FakeCore["approvals"],
    addOns: [] as FakeCore["addOns"],
    reingesting: false,
  };

  const open = (iface: string) => {
    const session: Session = { session_id: randomUUID(), interface: iface, session_status: "ACTIVE", created_at: now(), closed_at: null };
    const token = `fake-token-${randomUUID()}`;
    fake.sessions.set(session.session_id, session);
    fake.tokens.set(token, session.session_id);
    return { ...session, token };
  };
  const save = (sessionId: string, role: string, content: string, sources?: Record<string, unknown>[]): Message => {
    const m = {
      message_id: randomUUID(),
      sequence_no: fake.messages.filter((x) => x.session_id === sessionId).length + 1,
      role,
      content_masked: content.replace(MASKED, "[MASKED]"),
      created_at: now(),
      session_id: sessionId,
      ...(sources?.length ? { sources } : {}),
    };
    fake.messages.push(m);
    return m;
  };

  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const refuse = (res: ServerResponse, status: number, code: string, message: string) => send(res, status, { code, message, details: {} });

  const handle = (req: IncomingMessage, res: ServerResponse, raw: string) => {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const body = raw && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw) : undefined;
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    fake.calls.push({ method: req.method ?? "", path: `${path}${url.search}`, body, token });
    const m = req.method;

    if (m === "POST" && path === "/sessions") return send(res, 201, open(body.interface));
    if (m === "POST" && path === "/sessions/web-sign-in") {
      if (!fake.codes.delete(body.code)) return refuse(res, 401, "INVALID_SIGN_IN_CODE", "The sign-in code is not valid.");
      return send(res, 201, open("web"));
    }
    const me = fake.tokens.get(token);
    if (!me) return refuse(res, 401, "UNAUTHORIZED", "A valid session token is required.");

    if (m === "GET" && path === "/sessions") {
      const list = [...fake.sessions.values()].filter((s) => (!url.searchParams.get("interface") || s.interface === url.searchParams.get("interface")) && (!url.searchParams.get("session_status") || s.session_status === url.searchParams.get("session_status")));
      return send(res, 200, list.reverse());
    }
    let hit = path.match(/^\/sessions\/([^/]+)(\/.*)?$/);
    if (hit) {
      const [, id, rest = ""] = hit;
      const session = fake.sessions.get(id);
      if (!session) return refuse(res, 404, "SESSION_NOT_FOUND", "No session has this id.");
      if (m === "GET" && rest === "") return send(res, 200, session);
      if (m === "GET" && rest === "/messages") return send(res, 200, fake.messages.filter((x) => x.session_id === id));
      if (m === "GET" && rest === "/agent-runs") {
        const status = fake.runs.get(id);
        return send(res, 200, status ? [{ agent_run_id: randomUUID(), agent_runs_status: status, model_name: "m", plan: null, started_at: now(), finished_at: null, session_id: id, assessment_id: null }] : []);
      }
      if (m === "POST" && rest === "/resume") {
        if (session.interface !== "web") return refuse(res, 403, "NOT_A_WEB_SESSION", "Only a web session can be resumed.");
        if (session.session_status === "CLOSED") return refuse(res, 409, "SESSION_CLOSED", "This session is already closed.");
        const token = `fake-token-${randomUUID()}`;
        fake.tokens.set(token, id);
        return send(res, 201, { ...session, token });
      }
      if (m === "POST" && rest === "/close") {
        if (id !== me) return refuse(res, 403, "NOT_YOUR_SESSION", "You can only close your own session.");
        session.session_status = "CLOSED";
        session.closed_at = now();
        return send(res, 200, session);
      }
      if (m === "POST" && rest === "/chat/stream") {
        if (id !== me) return refuse(res, 403, "NOT_YOUR_SESSION", "You can only write in your own session.");
        if (!fake.providers.some((p) => p.is_active)) return refuse(res, 503, "NO_ACTIVE_PROVIDER", "Choose a model first.");
        const message = save(id, "user", body.content);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const text of fake.agent.pieces) res.write(`event: PIECE\ndata: ${JSON.stringify({ text })}\n\n`);
        if (fake.agent.error) return res.end(`event: ERROR\ndata: ${JSON.stringify({ code: "AGENT_FAILED", message: fake.agent.error, details: {} })}\n\n`);
        const reply = save(id, "assistant", fake.agent.reply ?? fake.agent.pieces.join(""), fake.agent.sources);
        return res.end(`event: DONE\ndata: ${JSON.stringify({ message, reply, agent_run_id: randomUUID(), sources: fake.agent.sources ?? [] })}\n\n`);
      }
    }

    if (m === "GET" && path === "/knowledge-add-ons") return send(res, 200, fake.addOns.map((a) => a.row));
    if (m === "POST" && path === "/knowledge-add-ons") {
      const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? "upload.md";
      const text = raw.split("\r\n\r\n")[1]?.split("\r\n--")[0] ?? "";
      if (!text.trim()) return refuse(res, 422, "FILE_HAS_NO_TEXT", "That file has no readable text to add.");
      const waits = /name="ingest_now"\r\n\r\nfalse/.test(raw);
      const row = { knowledge_add_on_id: randomUUID(), name, kind: "MD", size_bytes: text.length, chunk_count: 1, interface: "web", created_at: now(), ingest_status: waits ? "PENDING" : "INGESTED" };
      const refs = /CWE-89/.test(text) ? [{ type: "CWE", ref_id: "CWE-89", label: "CWE-89", count: 1 }] : [];
      fake.addOns.push({ row, references: refs, text });
      return send(res, 201, row);
    }
    if (path === "/knowledge/reingest") {
      const scope = url.searchParams.get("scope") === "NEW" ? "NEW" : "ALL";
      const job = { scope, step: "PUBLIC", public_pieces: 0, new_ingested: 0, add_ons_done: 0, add_ons_total: 0, started_at: null, finished_at: null, error_code: null, error_message: null };
      if (m === "GET") return send(res, 200, { ...job, status: fake.reingesting ? "RUNNING" : "IDLE", step: fake.reingesting ? "PUBLIC" : null });
      if (fake.reingesting) return refuse(res, 409, "REINGEST_RUNNING", "The knowledge is being re-ingested already.");
      fake.reingesting = true;
      return send(res, 202, { ...job, status: "RUNNING", started_at: now() });
    }
    if (m === "GET" && path === "/knowledge/search") {
      const q = url.searchParams.get("q") ?? "";
      const sources = url.searchParams.getAll("source");
      if (q === "CWE-89" && sources.includes("CWE"))
        return send(res, 200, [{ source: "CWE", ref_id: "CWE-89", title: "CWE-89: SQL Injection", text: "Improper neutralization of special elements used in an SQL command.", url: "https://cwe.mitre.org/data/definitions/89.html", section: "", score: 0.9 }]);
      return send(res, 200, []);
    }
    hit = path.match(/^\/knowledge-add-ons\/([^/]+)\/passages$/);
    if (m === "GET" && hit) {
      const a = fake.addOns.find((x) => x.row.knowledge_add_on_id === hit![1]);
      if (!a) return refuse(res, 404, "KNOWLEDGE_ADD_ON_NOT_FOUND", "No knowledge add-on with this id.");
      const at = a.text.indexOf("CWE-89");
      const spans = at >= 0 ? [{ type: "CWE", ref_id: "CWE-89", start: at, end: at + 6 }] : [];
      return send(res, 200, { knowledge_add_on_id: hit[1], total: 1, offset: 0, passages: [{ index: 0, text: a.text, spans }] });
    }
    hit = path.match(/^\/knowledge-add-ons\/([^/]+)(\/references)?$/);
    if (hit) {
      const a = fake.addOns.find((x) => x.row.knowledge_add_on_id === hit![1]);
      if (!a) return refuse(res, 404, "KNOWLEDGE_ADD_ON_NOT_FOUND", "No knowledge add-on with this id.");
      if (m === "GET" && hit[2]) return send(res, 200, { knowledge_add_on_id: hit[1], references: a.references });
      if (m === "DELETE" && !hit[2]) {
        fake.addOns.splice(fake.addOns.indexOf(a), 1);
        res.writeHead(204);
        return res.end();
      }
    }
    if (m === "GET" && path === "/assessments") return send(res, 200, fake.assessments.map((a) => a.row));
    hit = path.match(/^\/assessments\/([^/]+)\/(overview|actions|timeline)$/);
    if (m === "GET" && hit) {
      const a = fake.assessments.find((x) => x.row.assessment_id === hit![1]);
      if (!a) return refuse(res, 404, "ASSESSMENT_NOT_FOUND", "No assessment with this id.");
      if (hit[2] === "overview") return send(res, 200, a.overview);
      if (hit[2] === "actions") return send(res, 200, a.actions);
      return send(res, 200, { events: a.events, has_older: false });
    }
    if (m === "GET" && path === "/findings") {
      const a = fake.assessments.find((x) => x.row.assessment_id === url.searchParams.get("assessment_id"));
      return send(res, 200, a ? a.findings : []);
    }
    if (m === "GET" && path === "/approvals") return send(res, 200, fake.approvals.filter((x) => x.approval_status === (url.searchParams.get("status") ?? "PENDING")));
    if (m === "GET" && path === "/llm-providers") return send(res, 200, fake.providers);
    if (m === "POST" && path === "/llm-providers") {
      const local = body.provider_type === "OLLAMA" || /^http:\/\/(127\.0\.0\.1|localhost)/.test(body.base_url ?? "");
      const row: Provider = {
        llm_provider_id: randomUUID(),
        provider_type: body.provider_type,
        display_name: body.display_name,
        base_url: body.base_url ?? null,
        api_key_last4: body.api_key ? String(body.api_key).slice(-4) : null,
        model_name: body.model_name,
        is_active: false,
        is_local: local,
        created_by: "tester@host",
        created_at: now(),
        updated_at: now(),
      };
      fake.providers.push(row);
      return send(res, 201, row);
    }
    hit = path.match(/^\/llm-providers\/([^/]+)(\/.*)?$/);
    if (hit) {
      const [, id, rest = ""] = hit;
      const row = fake.providers.find((p) => p.llm_provider_id === id);
      if (!row) return refuse(res, 404, "LLM_PROVIDER_NOT_FOUND", "No provider has this id.");
      if (m === "PATCH" && rest === "") {
        if ("display_name" in body) row.display_name = body.display_name;
        if ("model_name" in body) row.model_name = body.model_name;
        if ("base_url" in body) row.base_url = body.base_url;
        if ("api_key" in body) row.api_key_last4 = body.api_key ? String(body.api_key).slice(-4) : null;
        return send(res, 200, row);
      }
      if (m === "DELETE" && rest === "") {
        fake.providers.splice(fake.providers.indexOf(row), 1);
        res.writeHead(204);
        return res.end();
      }
      if (m === "POST" && rest === "/activate") {
        for (const p of fake.providers) p.is_active = p === row;
        return send(res, 200, { llm_provider: row, approval: null });
      }
      if (m === "POST" && rest === "/test") return send(res, 200, { ok: true, model_name: row.model_name, latency_ms: 42, code: null, message: null });
      if (m === "GET" && rest === "/models") {
        if (fake.listFails) return refuse(res, 503, "MODEL_UNAVAILABLE", "The server did not answer with its models.");
        // a cloud service lists everything it has for the key, chat or not (as OpenAI does)
        if (["OPENAI", "ANTHROPIC", "DEEPSEEK"].includes(row.provider_type)) return send(res, 200, { models: CLOUD_MODELS });
        if (row.provider_type === "OPENAI_API_COMPATIBLE" && !row.is_local) {
          return refuse(res, 422, "MODEL_LIST_NOT_SUPPORTED", "Only Ollama, a cloud service or an OpenAI-compatible server on this computer can list its models.");
        }
        return send(res, 200, { models: ["llama3.2", "qwen:7b"] });
      }
    }
    return refuse(res, 404, "NOT_FOUND", "Not found.");
  };

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => handle(req, res, raw));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return Object.assign(fake, {
    url,
    restart: () => fake.tokens.clear(),
    close: () => new Promise<void>((done) => server.close(() => done())),
  });
}
