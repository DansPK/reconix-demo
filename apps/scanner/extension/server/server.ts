// The demo scanner server: the contract's MCP tools with in-memory state, canned findings,
// the presigned upload URL (with hash check), and progress notifications in watch_scan.
// No LLM, no keys, no external services. Run it with `npm run server`
// (token "test-token", port 7357). The extension's unit/integration tests import FakeHarness
// from here too.

import { createHash, randomUUID } from "crypto";
import * as http from "http";
import * as https from "https";
import { AddressInfo } from "net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { route } from "../src/routing";
import type { ActiveModel, ChatAction, Finding, ManifestEntry, ProviderInfo, ScanSummary } from "../src/shared/contract";

/** A tiny stand-in for the harness provider catalog, enough for the extension's picker tests. */
const CATALOG: { id: string; label: string; kind: ProviderInfo["kind"]; needs_key: boolean; key_optional: boolean;
  base_mode: ProviderInfo["base_mode"]; multi_model: boolean; default_models: string[]; default_base: string }[] = [
  { id: "reconix", label: "Reconix", kind: "reconix", needs_key: true, key_optional: false,
    base_mode: "readonly", multi_model: false, default_models: ["default-model"], default_base: "http://llm" },
  { id: "openai", label: "OpenAI", kind: "custom", needs_key: true, key_optional: false,
    base_mode: "fixed", multi_model: false, default_models: ["gpt-4o-mini"], default_base: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic", kind: "custom", needs_key: true, key_optional: false,
    base_mode: "fixed", multi_model: false, default_models: ["claude-3-5-sonnet-latest"], default_base: "https://api.anthropic.com" },
  { id: "deepseek", label: "DeepSeek", kind: "custom", needs_key: true, key_optional: false,
    base_mode: "fixed", multi_model: false, default_models: ["deepseek-chat"], default_base: "https://api.deepseek.com/v1" },
  { id: "ollama", label: "Ollama", kind: "custom", needs_key: false, key_optional: true,
    base_mode: "required", multi_model: false, default_models: [], default_base: "http://host.docker.internal:11434/v1" },
  { id: "openai_compatible", label: "OpenAI-compatible API", kind: "custom", needs_key: true, key_optional: false,
    base_mode: "required", multi_model: false, default_models: [], default_base: "https://api.openai.com/v1" },
];

export interface FakeOptions {
  token?: string;
  port?: number;
  /** Milliseconds between scan progress steps. */
  stepMs?: number;
  /** Findings to return; `path` values should exist in the test workspace. */
  findings?: Partial<Finding>[];
  /** A scanner-failure message to report when a scan finishes (tests only; the demo sets none). */
  scanError?: string;
  /** Serve HTTPS with this PEM certificate and key. */
  tls?: { cert: string; key: string };
}

interface Session {
  id: string; owner: string; name: string; target_type: "workspace" | "github"; repo_url: string | null;
  created_at: string; manifest: Map<string, ManifestEntry>; pending: ManifestEntry[] | null;
  messages: { role: "user" | "assistant"; text: string; finding_ids: string[] }[];
}

interface Upload { id: string; session: string; size: number; sha256: string; expires: number; used: boolean;
  data?: Buffer }

export class FakeHarness {
  token: string;
  url = "";
  sessions = new Map<string, Session>();
  uploads = new Map<string, Upload>();
  scans = new Map<string, ScanSummary>();
  calls: { name: string; args: any }[] = [];
  /** When set, the next watch_scan drops its connection after the first progress notification. */
  dropNextWatch = false;
  /** When set, the next upload is answered with this status. */
  forceUploadStatus: number | null = null;
  /** When set, chat fails as if the LLM were down. */
  llmDown = false;
  /** Flexible-model state: configured providers + the single active model. */
  configured = new Map<string, { api_key_hint: string; base_url: string; models: string[];
    status: ProviderInfo["status"]; status_detail: string; tested_at: string }>();
  active: ActiveModel | null = null;
  private server?: http.Server | https.Server;
  private timers = new Set<NodeJS.Timeout>();

  constructor(private opts: FakeOptions = {}) {
    this.token = opts.token ?? "test-token";
    // Seed a reachable default, like the harness seeding from LLM_MODEL.
    this.configured.set("reconix", { api_key_hint: "k…key", base_url: "http://llm", models: ["default-model"],
      status: "REACHABLE", status_detail: "seeded", tested_at: new Date().toISOString() });
    this.active = { provider_id: "reconix", model: "default-model", label: "Reconix",
      activated_at: new Date().toISOString() };
  }

  private providerView(id: string): ProviderInfo {
    const c = CATALOG.find((x) => x.id === id)!;
    const row = this.configured.get(id);
    const activeHere = this.active?.provider_id === id;
    return { id, label: c.label, kind: c.kind, needs_key: c.needs_key, key_optional: c.key_optional,
      base_mode: c.base_mode, multi_model: c.multi_model, configured: !!row,
      api_key_hint: row?.api_key_hint ?? "", base_url: row?.base_url || c.default_base,
      models: row?.models ?? c.default_models, status: row?.status ?? "UNTESTED",
      status_detail: row?.status_detail ?? "", tested_at: row?.tested_at ?? "",
      active_model: activeHere ? this.active!.model : "" };
  }

  async start(): Promise<string> {
    const handler = (req: http.IncomingMessage, res: http.ServerResponse) => this.handle(req, res).catch((e) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(e));
    });
    this.server = this.opts.tls ? https.createServer(this.opts.tls, handler) : http.createServer(handler);
    await new Promise<void>((r) => this.server!.listen(this.opts.port ?? 0, "127.0.0.1", r));
    this.url = `${this.opts.tls ? "https" : "http"}://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop() {
    for (const t of this.timers) clearInterval(t);
    this.server?.closeAllConnections();
    await new Promise((r) => this.server?.close(r));
  }

  lastUploadArchive(): Buffer | undefined {
    return [...this.uploads.values()].filter((u) => u.data).pop()?.data;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", this.url);
    if (url.pathname.startsWith("/uploads/") && req.method === "PUT") {
      await this.receiveUpload(req, res, url);
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${this.token}`) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
      return;
    }
    const body = req.method === "POST" ? JSON.parse((await readBody(req)).toString() || "null") : undefined;
    const server = new Server({ name: "fake-harness", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_NAMES.map((name) => ({ name, inputSchema: { type: "object" as const } })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args = {} } = request.params;
      this.calls.push({ name, args });
      try {
        const result = await this.tool(name, args as any, extra, request.params._meta?.progressToken, res);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  private session(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error("session not found");
    return s;
  }

  private async tool(name: string, a: any, extra: any, progressToken: string | number | undefined,
                     res: http.ServerResponse): Promise<any> {
    switch (name) {
      case "create_session": {
        const id = randomUUID().replace(/-/g, "").slice(0, 24);
        if (a.target_type === "github" && !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+?(\.git)?\/?$/.test(a.repo_url ?? "")) {
          throw new Error("only https://github.com/<owner>/<repo> links are supported");
        }
        this.sessions.set(id, {
          id, owner: "me", name: a.name ?? (a.target_type === "github" ? a.repo_url.split("github.com/")[1] : "Workspace scan"),
          target_type: a.target_type ?? "workspace", repo_url: a.repo_url ?? null,
          created_at: new Date().toISOString(), manifest: new Map(), pending: null, messages: [],
        });
        return { session_id: id };
      }
      case "list_sessions":
        return { sessions: [...this.sessions.values()].map((s) => this.sessionFields(s)) };
      case "get_session": {
        const s = this.session(a.session_id);
        const latest = this.latestScan(s.id);
        return { session: this.sessionFields(s), messages: s.messages.slice(-(a.message_limit ?? 50)),
                 latest_scan_id: latest?.scan_id ?? null, file_count: s.manifest.size };
      }
      case "rename_session":
        this.session(a.session_id).name = a.name;
        return { ok: true };
      case "delete_session":
        this.session(a.session_id);
        this.sessions.delete(a.session_id);
        return { ok: true };
      case "sync_files": {
        const s = this.session(a.session_id);
        const m: ManifestEntry[] = a.manifest;
        const need = m.filter((e) => s.manifest.get(e.path)?.sha256 !== e.sha256).map((e) => e.path);
        const seen = new Set(m.map((e) => e.path));
        const del = [...s.manifest.keys()].filter((p) => !seen.has(p)).sort();
        s.pending = m;
        return { need, delete: del, unchanged_count: m.length - need.length };
      }
      case "request_upload": {
        this.session(a.session_id);
        const id = randomUUID();
        const expires = Date.now() + 600_000;
        this.uploads.set(id, { id, session: a.session_id, size: a.size_bytes, sha256: a.sha256, expires, used: false });
        return { upload_id: id, upload_url: `${this.url}/uploads/${id}?sig=fake`,
                 expires_at: new Date(expires).toISOString() };
      }
      case "start_scan": {
        const s = this.session(a.session_id);
        if ([...this.scans.values()].some((x) => x.session_id === s.id && (x.status === "running" || x.status === "queued"))) {
          throw new Error("a scan is already running for this session");
        }
        if (s.target_type === "github" && /private/.test(s.repo_url ?? "") && !a.github_token) {
          const repo = s.repo_url!.split("github.com/")[1];
          throw new Error(`Could not get ${repo} from GitHub (git clone failed). If the repository is private, sign in to GitHub and scan again.`);
        }
        if (s.target_type === "workspace") {
          if (s.pending) {
            for (const e of s.pending) s.manifest.set(e.path, e);
            for (const p of [...s.manifest.keys()]) if (!s.pending.some((e) => e.path === p)) s.manifest.delete(p);
            s.pending = null;
          }
          if (a.upload_id && !this.uploads.get(a.upload_id)?.data) throw new Error("upload not found");
        }
        return { scan_id: this.runScan(s) };
      }
      case "watch_scan": {
        const scan = this.scans.get(a.scan_id);
        if (!scan) throw new Error("scan not found");
        let first = true;
        while (scan.status === "running" || scan.status === "queued") {
          if (progressToken !== undefined) {
            await extra.sendNotification({ method: "notifications/progress",
              params: { progressToken, progress: scan.percent, total: 100, message: `Scanning: ${scan.percent}%` } });
          }
          if (first && this.dropNextWatch) {
            this.dropNextWatch = false;
            await sleep(20);
            res.destroy();
            await sleep(10_000);
          }
          first = false;
          await sleep(this.step / 2);
        }
        return scan;
      }
      case "get_scan_status": {
        const scan = this.scans.get(a.scan_id);
        if (!scan) throw new Error("scan not found");
        return scan;
      }
      case "cancel_scan": {
        const scan = this.scans.get(a.scan_id);
        if (!scan) throw new Error("scan not found");
        scan.status = "cancelled";
        scan.finished_at = new Date().toISOString();
        return { ok: true };
      }
      case "get_findings": {
        const s = this.session(a.session_id);
        const scan = a.scan_id ? this.scans.get(a.scan_id) : this.latestScan(s.id, true);
        let all = scan ? this.findingsFor(s) : [];
        if (scan && scan.status === "running") {
          // While a scan runs, findings come in gradually and have not been reviewed yet.
          all = all.slice(0, Math.ceil((all.length * scan.percent) / 100))
            .map((f) => ({ ...f, explanation: "", fix_recommendation: "", verdict: "unsure" as const }));
        }
        const off = a.offset ?? 0;
        const lim = a.limit ?? 200;
        return { findings: all.slice(off, off + lim), total: all.length };
      }
      case "summarize_findings": {
        const s = this.session(a.session_id);
        const all = this.latestScan(s.id, true) ? this.findingsFor(s) : [];
        const counts: Record<string, number> = {};
        for (const f of all) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
        const real = all.filter((f) => f.verdict === "likely_real");
        return {
          summary: `**${all.length} findings.** Fix the SQL injection first.`, finding_ids: real.slice(0, 1).map((f) => f.id),
          card: { total: all.length, counts, likely_real: real.length, false_alarms: all.length - real.length,
                  files: real.slice(0, 1).map((f) => ({ path: f.path, count: 1 })), overall: "One real problem.",
                  fix_first: real.slice(0, 1).map((f) => ({ text: `Use a parameterised query in ${f.path}`, finding_ids: [f.id] })) },
        };
      }
      case "fix_findings": {
        const s = this.session(a.session_id);
        if (s.target_type !== "workspace") throw new Error("auto-fix works only for workspace sessions");
        const all = this.latestScan(s.id, true) ? this.findingsFor(s) : [];
        const chosen = (a.finding_ids as string[]).map((id) => all.find((x) => x.id === id));
        if (!chosen.length || chosen.some((f) => !f)) throw new Error("finding not found");
        if (progressToken !== undefined) {
          const file = chosen[0]!.path;
          for (const [kind, text] of [["start", "1 finding"], ["thinking", "Look at the "], ["thinking", "query first."],
                                      ["tool", `Edit ${file}`], ["result", "+1 −1 lines"], ["heartbeat", ""],
                                      ["text", "Done."], ["done", "Finished 1 of 1 files"]]) {
            await extra.sendNotification({ method: "notifications/progress",
              params: { progressToken, progress: 50, total: 100, message: JSON.stringify({ file, kind, text }) } });
          }
        }
        return {
          files: chosen.map((f) => {
            // f.path may be the real (possibly nested) workspace path, so match FIXES by suffix.
            const key = f!.path in FIXES ? f!.path
              : Object.keys(FIXES).find((k) => f!.path === k || f!.path.endsWith(`/${k}`));
            const edit = (key ? FIXES[key] : undefined)
              ?? { start_line: f!.start_line, end_line: f!.end_line, replacement: "// fixed" };
            return { path: f!.path, file_sha256: f!.file_sha256, edits: [edit] };
          }),
          summary: "- Rewrote the unsafe code to its secure form.",
          results: chosen.map((f) => ({ finding_id: f!.id, status: "fixed", note: "No longer reported." })),
        };
      }
      case "chat": {
        const s = this.session(a.session_id);
        if (this.llmDown) throw new Error("The LLM cannot be reached. Check LLM_BASE_URL on the scanner server.");
        const { reply, action } = this.agent(s, a.message);
        s.messages.push({ role: "user", text: a.message, finding_ids: [] },
                        { role: "assistant", text: reply, finding_ids: [] });
        return { reply, finding_ids: [], action };
      }
      case "list_providers":
        return { providers: CATALOG.map((c) => this.providerView(c.id)), active: this.active };
      case "set_provider": {
        const c = CATALOG.find((x) => x.id === a.provider_id);
        if (!c) throw new Error("Unknown provider.");
        const row = this.configured.get(a.provider_id);
        const models = a.models ?? row?.models ?? c.default_models;
        if (c.needs_key && !a.api_key && !row) throw new Error(`${c.label} needs an API key.`);
        this.configured.set(a.provider_id, {
          api_key_hint: a.api_key ? `${String(a.api_key).slice(0, 3)}…${String(a.api_key).slice(-4)}` : row?.api_key_hint ?? "",
          base_url: a.base_url ?? row?.base_url ?? "", models, status: "UNTESTED", status_detail: "", tested_at: "" });
        return this.providerView(a.provider_id);
      }
      case "test_provider": {
        const c = CATALOG.find((x) => x.id === a.provider_id);
        if (!c) throw new Error("Unknown provider.");
        const row = this.configured.get(a.provider_id) ?? { api_key_hint: "", base_url: "",
          models: c.default_models, status: "UNTESTED" as const, status_detail: "", tested_at: "" };
        if (!a.model && !row.models.length) throw new Error("No model to test. Add a model name first.");
        // Like the harness: testing a model by name makes it a custom provider's model.
        if (a.model && c.base_mode !== "readonly" && !row.models.includes(a.model)) row.models = [a.model];
        row.status = "REACHABLE";
        row.status_detail = "reachable";
        row.tested_at = new Date().toISOString();
        this.configured.set(a.provider_id, row);
        return this.providerView(a.provider_id);
      }
      case "activate_model": {
        const c = CATALOG.find((x) => x.id === a.provider_id);
        if (!c) throw new Error("Unknown provider.");
        const row = this.configured.get(a.provider_id);
        if (!row) throw new Error(`${c.label} is not configured.`);
        if (row.status !== "REACHABLE") throw new Error("Test the connection first — the provider is not reachable.");
        if (!row.models.includes(a.model)) throw new Error(`${a.model} is not configured for ${c.label}.`);
        this.active = { provider_id: a.provider_id, model: a.model, label: c.label,
          activated_at: new Date().toISOString() };
        return this.active;
      }
      case "active_model":
        return { active: this.active };
    }
    throw new Error(`unknown tool ${name}`);
  }

  get stepMs() {
    return this.opts.stepMs ?? 50;
  }

  set stepMs(ms: number) {
    this.opts.stepMs = ms;
  }

  /** A stand-in for the harness's agent: decides with simple rules what the message wants. */
  private agent(s: Session, text: string): { reply: string; action: ChatAction | null } {
    const base = { full: false, paths: [] as string[], url: null as string | null, confirm: false, finding_ids: [] as string[] };
    const running = [...this.scans.values()].some((x) => x.session_id === s.id && x.status === "running");
    if (/^\s*(stop|cancel)\b/i.test(text)) {
      return running ? { reply: "Stopping the scan.", action: { ...base, type: "cancel" } }
        : { reply: "No scan is running right now.", action: null };
    }
    if (/^\s*fix\b/i.test(text)) {
      return { reply: "Preparing fixes.", action: { ...base, type: "fix", finding_ids: this.findingsFor(s).map((f) => f.id) } };
    }
    const r = route(text);
    if (r.kind === "github") return { reply: `Scanning ${r.url}.`, action: { ...base, type: "scan_github", url: r.url } };
    if (/\bsafe\?/i.test(text)) {
      return { reply: "Do you want me to scan the workspace?", action: { ...base, type: "scan", confirm: true } };
    }
    if (r.kind === "scan" || r.kind === "rescan" || /\bscan\b/i.test(text)) {
      const only = text.match(/\bonly (?:the )?([\w./-]+?)(?: folder)?\s*$/i);
      const full = /from scratch|full scan/i.test(text);
      return { reply: "Starting a scan.", action: { ...base, type: "scan", full, paths: only ? [only[1]] : [] } };
    }
    const reply = `You said: **${text}**\n\n\`\`\`js\nconsole.log("hi")\n\`\`\``;
    return { reply, action: null };
  }

  private get step() {
    return this.stepMs;
  }

  private runScan(s: Session) {
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const scan: ScanSummary = { scan_id: id, session_id: s.id, status: "running", stage: "semgrep", percent: 0,
      counts: {}, error: null, started_at: new Date().toISOString(), finished_at: null };
    this.scans.set(id, scan);
    const t = setInterval(() => {
      if (scan.status !== "running") {
        clearInterval(t);
        return;
      }
      scan.percent = Math.min(scan.percent + 25, 100);
      if (scan.percent === 100) {
        scan.status = "done";
        scan.stage = "finished";
        scan.error = this.opts.scanError ?? null;
        scan.finished_at = new Date().toISOString();
        const counts: Record<string, number> = {};
        for (const f of this.findingsFor(s)) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
        scan.counts = counts;
        clearInterval(t);
      }
    }, this.step);
    this.timers.add(t);
    return id;
  }

  private findingsFor(s: Session): Finding[] {
    const list = (this.opts.findings ?? []).map((o, i) => {
      const f: Finding = {
        id: `f${i}`, tools: ["semgrep"], rule_id: "rule", title: `Finding ${i}`, severity: "high", cwe: null,
        path: "app.js", start_line: 1, end_line: 1, start_col: null, end_col: null, file_sha256: "", message: "m",
        snippet: "", verdict: "likely_real", explanation: "Explanation. More text.",
        fix_recommendation: "Fix it this way. Then test.", suggested_patch: null, status: "new", web_url: null, ...o,
      };
      f.file_sha256 = s.manifest.get(f.path)?.sha256 ?? "";
      if (s.target_type === "github") f.web_url = `${s.repo_url}/blob/abc/${f.path}#L${f.start_line}-L${f.end_line}`;
      return f;
    });
    // Workspace: attach each finding to the uploaded file whose path ends with the finding's
    // path, so a scan works whether vuln-shop is the open folder or nested inside it. A finding
    // whose file was not uploaded is dropped, so scanning any other folder stays clean.
    if (s.target_type === "workspace" && s.manifest.size) {
      const keys = [...s.manifest.keys()];
      return list.flatMap((f) => {
        const match = keys.find((k) => k === f.path || k.endsWith(`/${f.path}`));
        if (!match) return [];
        f.path = match;
        f.file_sha256 = s.manifest.get(match)!.sha256;
        return [f];
      });
    }
    return list;
  }

  private latestScan(sessionId: string, doneOnly = false) {
    return [...this.scans.values()].filter((x) => x.session_id === sessionId && (!doneOnly || x.status === "done")).pop();
  }

  private sessionFields(s: Session) {
    const last = this.latestScan(s.id);
    return { session_id: s.id, name: s.name, target_type: s.target_type, repo_url: s.repo_url,
             created_at: s.created_at, last_scan_at: last?.started_at ?? null, last_scan_status: last?.status ?? null };
  }

  private async receiveUpload(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const id = url.pathname.split("/").pop()!;
    const u = this.uploads.get(id);
    const data = await readBody(req);
    const send = (code: number, msg: string) => res.writeHead(code, { "content-type": "application/json" })
      .end(JSON.stringify({ error: msg }));
    if (this.forceUploadStatus) {
      const code = this.forceUploadStatus;
      this.forceUploadStatus = null;
      send(code, "forced");
      return;
    }
    if (!u || url.searchParams.get("sig") !== "fake" || Date.now() > u.expires) {
      send(403, "bad signature");
      return;
    }
    if (u.used) {
      send(409, "already used");
      return;
    }
    u.used = true;
    const sha = createHash("sha256").update(data).digest("hex");
    if (data.length !== u.size || sha !== u.sha256) {
      send(400, "size or hash mismatch");
      return;
    }
    u.data = data;
    res.writeHead(201, { "content-type": "application/json" }).end('{"ok":true}');
  }
}

const TOOL_NAMES = ["create_session", "list_sessions", "get_session", "rename_session", "delete_session",
  "sync_files", "request_upload", "start_scan", "watch_scan", "get_scan_status", "cancel_scan", "get_findings", "chat",
  "fix_findings", "summarize_findings",
  "list_providers", "set_provider", "test_provider", "activate_model", "active_model"];

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Canned findings for the demo: a spread of severities across files that exist in a typical
 * JS/TS project. Everything else (snippet, review verdict, ids) is filled in by findingsFor(). */
const DEMO_FINDINGS: Partial<Finding>[] = [
  { path: "src/index.js", title: "SQL injection in user lookup", severity: "critical",
    rule_id: "javascript.express.sql-injection", cwe: "CWE-89", tools: ["semgrep"],
    start_line: 42, end_line: 42,
    message: "User input is concatenated directly into a SQL query.",
    snippet: "const q = `SELECT * FROM users WHERE id = ${req.query.id}`;",
    verdict: "likely_real",
    explanation: "The id query parameter reaches the database without escaping, so an attacker can read or modify any row.",
    fix_recommendation: "Use a parameterised query: db.query('SELECT * FROM users WHERE id = ?', [req.query.id])." },
  { path: "src/routes/exec.js", title: "OS command injection", severity: "critical",
    rule_id: "javascript.lang.command-injection", cwe: "CWE-78", tools: ["semgrep"],
    start_line: 17, end_line: 17,
    message: "Untrusted input is passed to child_process.exec.",
    snippet: "exec(`ping -c 1 ${req.body.host}`);",
    verdict: "likely_real",
    explanation: "The host field is shelled out unescaped, letting an attacker run arbitrary commands.",
    fix_recommendation: "Use execFile with an argument array and validate the host against an allow-list." },
  { path: "src/config.js", title: "Hard-coded API credential", severity: "high",
    rule_id: "gitleaks.generic-api-key", cwe: "CWE-798", tools: ["gitleaks"],
    start_line: 8, end_line: 8,
    message: "A secret-looking token is committed in source.",
    snippet: "const STRIPE_KEY = \"sk_live_************************\";",
    verdict: "likely_real",
    explanation: "Secrets in source are exposed to anyone with repository access and leak through history.",
    fix_recommendation: "Move the key to an environment variable and rotate the exposed one." },
  { path: "src/views/profile.js", title: "Reflected XSS in profile page", severity: "medium",
    rule_id: "javascript.browser.dom-xss", cwe: "CWE-79", tools: ["semgrep"],
    start_line: 23, end_line: 23,
    message: "User input is written to innerHTML.",
    snippet: "el.innerHTML = params.get('name');",
    verdict: "likely_real",
    explanation: "The name parameter is rendered as HTML, so a crafted link can run script in the victim's session.",
    fix_recommendation: "Set textContent instead of innerHTML, or sanitise the value first." },
  { path: "src/utils/hash.js", title: "Weak password hash (MD5)", severity: "low",
    rule_id: "javascript.crypto.weak-hash", cwe: "CWE-327", tools: ["semgrep"],
    start_line: 5, end_line: 5,
    message: "MD5 is used to hash passwords.",
    snippet: "return crypto.createHash('md5').update(pw).digest('hex');",
    verdict: "likely_real",
    explanation: "MD5 is fast and broken for password storage; hashes can be brute-forced cheaply.",
    fix_recommendation: "Use a slow, salted KDF such as bcrypt, scrypt or argon2." },
];

/** The secure replacement for each planted finding, as whole-line edits over the
 * vuln-shop sample. Keyed by the finding's file; shown as a diff and applied on "Fix". */
const FIXES: Record<string, { start_line: number; end_line: number; replacement: string }> = {
  // SQL injection: parameterise the query and bind the id (lines 42-43).
  "src/index.js": { start_line: 42, end_line: 43,
    replacement: '  const q = "SELECT * FROM users WHERE id = ?";\n  db.get(q, [req.query.id], (err, row) => {' },
  // Command injection: execFile with an argument array instead of a shell string.
  "src/routes/exec.js": { start_line: 17, end_line: 17,
    replacement: '  require("child_process").execFile("ping", ["-c", "1", host]);' },
  // Hard-coded credential: read it from the environment.
  "src/config.js": { start_line: 8, end_line: 8,
    replacement: 'const STRIPE_KEY = process.env.STRIPE_KEY;' },
  // Reflected XSS: textContent escapes markup; innerHTML does not.
  "src/views/profile.js": { start_line: 23, end_line: 23,
    replacement: "  el.textContent = params.get('name');" },
  // Weak hash: scrypt is a slow, salted KDF built into Node's crypto.
  "src/utils/hash.js": { start_line: 5, end_line: 5,
    replacement: '  return crypto.scryptSync(pw, "salt", 64).toString("hex");' },
};

if (require.main === module) {
  const h = new FakeHarness({ port: Number(process.env.PORT ?? 7357), stepMs: 1000, findings: DEMO_FINDINGS });
  h.start().then((url) => console.log(`Reconix scanner on ${url} (token: ${h.token})`));
}
