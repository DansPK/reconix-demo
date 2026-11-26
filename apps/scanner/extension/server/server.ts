// The demo scanner server: the contract's MCP tools with in-memory state, canned findings,
// the presigned upload URL (with hash check), and progress notifications in watch_scan.
// No LLM, no keys, no external services. Run it with `npm run server`
// (token "test-token", port 7357). The extension's unit/integration tests import FakeHarness
// from here too.

import { createHash, randomUUID } from "crypto";
import * as http from "http";
import * as https from "https";
import { AddressInfo } from "net";
import * as tar from "tar";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { staticAnswer } from "../src/backend/staticChat";
import { toFinding, type AgentEvent, type ChatContext, type ChatReply, type FileFix, type Finding, type FixOutcome,
  type ManifestEntry, type ScanSummary } from "../src/backend/wire";
import { hiddenAsFalse, mergeFindings, prepareFindings, underPaths } from "../src/findingsLogic";
import { MAX_FIX_FINDINGS } from "../src/fixLogic";
import { commandFor, githubRepoUrl } from "../src/routing";
import type { ChatCommand } from "../src/shared/contract";

// Script the Core API's default source pipeline; these labels never launch a scanner.
// Sonar is optional in Core and needs a configured server, so it is not a default stage.
const SCAN_STAGES = [
  { stage: "semgrep", label: "Semgrep · static analysis" },
  { stage: "gitleaks", label: "Gitleaks · secret detection" },
  { stage: "trivy", label: "Trivy · dependency and configuration checks" },
  { stage: "grype", label: "Grype · dependency vulnerability matching" },
  { stage: "osv-scanner", label: "OSV-Scanner · dependency advisory matching" },
  { stage: "syft", label: "Syft · software bill of materials" },
  { stage: "analysis", label: "Correlate findings and review evidence" },
] as const;

/** The one repository a GitHub scan knows. It is scripted: nothing is cloned and no host is contacted. */
export const LUMINA_REPO = "https://github.com/lumina-store/lumina-site";

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
  messages: { role: "user" | "assistant"; text: string; created_at: string }[];
  // The hash each finding-bearing file had when first scanned; a later scan whose file differs
  // counts that finding as fixed and drops it, so applying a fix and rescanning clears it.
  baselineHash: Map<string, string>;
  // The latest uploaded text of files that have a canned fix: once their vulnerable lines are gone the
  // finding is too, even when fixed before this session first saw the file (e.g. after a restart).
  content: Map<string, string>;
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
  /** Folders or files a scan was limited to. */
  private scanPaths = new Map<string, string[]>();
  /** When set, the next get_scan_status drops its connection. */
  dropNextStatus = false;
  /** When set, the next upload is answered with this status. */
  forceUploadStatus: number | null = null;
  /** When set, chat fails as if the LLM were down. */
  llmDown = false;
  private server?: http.Server | https.Server;
  private timers = new Set<NodeJS.Timeout>();

  constructor(private opts: FakeOptions = {}) {
    this.token = opts.token ?? "test-token";
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
    if (!s) throw new Error("SESSION_NOT_FOUND: This session is no longer on the scanner server. Start a new one.");
    return s;
  }

  private async tool(name: string, a: any, extra: any, progressToken: string | number | undefined,
                     res: http.ServerResponse): Promise<any> {
    switch (name) {
      case "create_session": {
        const id = randomUUID().replace(/-/g, "").slice(0, 24);
        this.sessions.set(id, {
          id, owner: "me", name: a.name ?? "Workspace scan", target_type: "workspace", repo_url: null,
          created_at: new Date().toISOString(), manifest: new Map(), pending: null, messages: [],
          baselineHash: new Map(), content: new Map(),
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
        s.target_type = "workspace"; // the folder replaces a cloned repository
        s.repo_url = null;
        return { need, delete: del, unchanged_count: m.length - need.length };
      }
      case "clone_repo": {
        const s = this.session(a.session_id);
        if (githubRepoUrl(a.url ?? "") !== LUMINA_REPO) {
          throw new Error(`This scanner has no access to ${a.url}. The connected repository is ${LUMINA_REPO}.`);
        }
        s.target_type = "github";
        s.repo_url = LUMINA_REPO;
        return { ok: true };
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
        if (s.target_type === "workspace") {
          if (s.pending) {
            for (const e of s.pending) s.manifest.set(e.path, e);
            for (const p of [...s.manifest.keys()]) if (!s.pending.some((e) => e.path === p)) s.manifest.delete(p);
            s.pending = null;
          }
          const upload = a.upload_id ? this.uploads.get(a.upload_id) : undefined;
          if (a.upload_id && !upload?.data) throw new Error("upload not found");
          if (upload?.data) await readFixable(upload.data, s.content);
        }
        return { scan_id: this.runScan(s, a.paths) };
      }
      case "get_scan_status": {
        if (this.dropNextStatus) {
          this.dropNextStatus = false;
          res.destroy();
        }
        const scan = this.scans.get(a.scan_id);
        if (!scan) throw new Error("scan not found");
        return scan;
      }
      case "cancel_scan": {
        const scan = this.scans.get(a.scan_id);
        if (!scan) throw new Error("scan not found");
        if (scan.status !== "running") return { ok: true };
        scan.status = "cancelled";
        scan.finished_at = new Date().toISOString();
        return { ok: true };
      }
      case "get_findings": {
        const s = this.session(a.session_id);
        const scan = a.scan_id ? this.scans.get(a.scan_id) : this.latestScan(s.id, true);
        const all = scan ? this.visible(s, scan) : [];
        const off = a.offset ?? 0;
        const lim = a.limit ?? 200;
        return { findings: all.slice(off, off + lim), total: all.length };
      }
      case "fix_findings":
        return this.fix(this.session(a.session_id), a.finding_ids, progressToken, extra);
      case "chat": {
        const s = this.session(a.session_id);
        if (this.llmDown) throw new Error("MODEL_UNAVAILABLE: The model is not answering.");
        const answer = this.answer(s, a.message, a);
        const created_at = new Date().toISOString();
        s.messages.push({ role: "user", text: a.message, created_at });
        if (answer.reply) s.messages.push({ role: "assistant", text: answer.reply, created_at });
        return answer;
      }
    }
    throw new Error(`unknown tool ${name}`);
  }

  get stepMs() {
    return this.opts.stepMs ?? 50;
  }

  set stepMs(ms: number) {
    this.opts.stepMs = ms;
  }

  /** Keyword rules stand in for the agent: a message is a command, or a question the findings answer. */
  private answer(s: Session, text: string, context: ChatContext): ChatReply {
    const scan = this.latestScan(s.id, true);
    const raw = scan ? this.visible(s, scan).map((f, i) => toFinding(f, scan.scan_id, i)) : undefined;
    const findings = raw ? [...prepareFindings(raw, false).findings, ...mergeFindings(raw.filter(hiddenAsFalse))] : [];
    const command = scanRequest(text) ?? commandFor(text, {
      findings, lastMentioned: context.last_mentioned ?? [], providers: context.providers ?? [],
    });
    if (command) return { reply: "", actions: [], action: command };
    const answer = staticAnswer(text, raw);
    return { reply: answer.text, actions: answer.actions, action: null };
  }

  /** The scripted fix agent: streams a transcript per file, then returns line edits placed in the uploaded text. */
  private async fix(s: Session, ids: string[], progressToken: string | number | undefined, extra: any) {
    if (s.target_type !== "workspace") throw new Error("Fixes work only for an open folder.");
    if (ids.length > MAX_FIX_FINDINGS) throw new Error(`The fix agent takes at most ${MAX_FIX_FINDINGS} findings at a time.`);
    const all = this.latestScan(s.id, true) ? this.findingsFor(s) : [];
    const chosen = ids.map((id) => all.find((f) => f.id === id));
    if (!chosen.length || chosen.some((f) => !f)) throw new Error("finding not found");
    const files: FileFix[] = [];
    const results: FixOutcome[] = [];
    const scripts: AgentEvent[][] = [];
    const summary: string[] = [];
    for (const path of [...new Set(chosen.map((f) => f!.path))].sort()) {
      const here = chosen.filter((f) => f!.path === path) as Finding[];
      const fix = fixFor(path);
      // findingsFor already followed the vulnerable lines to where they are now.
      const start_line = here[0].start_line;
      const edit = fix
        ? { start_line, end_line: start_line + fix.original.length - 1, replacement: fix.replacement }
        : { start_line, end_line: here[0].end_line, replacement: "// fixed" };
      files.push({ path, file_sha256: here[0].file_sha256, edits: [edit] });
      for (const f of here) {
        results.push({ finding_id: f.id, status: "fixed", note: "No longer reported." });
        summary.push(`- \`${path}\`: ${f.fix_recommendation}`);
      }
      scripts.push([
        { file: path, kind: "start", text: `${here.length} finding${here.length === 1 ? "" : "s"}` },
        { file: path, kind: "tool", text: `Read ${path}` },
        ...(here[0].explanation.match(/[^.]+\.?\s*/g) ?? []).map((text): AgentEvent => ({ file: path, kind: "thinking", text })),
        { file: path, kind: "tool", text: `Edit ${path}` },
        { file: path, kind: "result", text: `+${edit.replacement.split("\n").length} −${edit.end_line - edit.start_line + 1} lines` },
      ]);
    }
    const events: AgentEvent[] = [
      { file: null, kind: "status", text: `Working on ${ids.length} finding${ids.length === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}` },
      ...scripts.flatMap((script, i): AgentEvent[] =>
        [...script, { file: files[i].path, kind: "done", text: `Finished ${i + 1} of ${files.length} file${files.length === 1 ? "" : "s"}` }]),
      { file: null, kind: "status", text: "Checking all changes with the scanners" },
    ];
    for (const [i, event] of events.entries()) {
      if (extra.signal.aborted) throw new Error("The fix agent was stopped.");
      if (progressToken !== undefined) {
        await extra.sendNotification({ method: "notifications/progress",
          params: { progressToken, progress: i + 1, total: events.length, message: JSON.stringify(event) } });
      }
      await sleep(Math.min(this.step, 120));
    }
    return { files, results, summary: summary.join("\n") };
  }

  /** A scan's findings: only its paths, and while it runs only some, not reviewed yet. */
  private visible(s: Session, scan: ScanSummary): Finding[] {
    const paths = this.scanPaths.get(scan.scan_id);
    const all = this.findingsFor(s).filter((f) => !paths?.length || underPaths(f.path, paths));
    if (scan.status !== "running") return all;
    return all.slice(0, Math.ceil((all.length * scan.percent) / 100))
      .map((f) => ({ ...f, explanation: "", fix_recommendation: "", verdict: "unsure" as const }));
  }

  private count(s: Session, scan: ScanSummary) {
    const counts: ScanSummary["counts"] = {};
    for (const f of this.visible(s, scan)) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    return counts;
  }

  private get step() {
    return this.stepMs;
  }

  private runScan(s: Session, paths?: string[]) {
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    const scan: ScanSummary = { scan_id: id, session_id: s.id, status: "running", ...SCAN_STAGES[0], percent: 0,
      counts: {}, error: null, started_at: new Date().toISOString(), finished_at: null };
    this.scans.set(id, scan);
    if (paths?.length) this.scanPaths.set(id, paths);
    let stageIndex = 0;
    const t = setInterval(() => {
      if (scan.status !== "running") {
        clearInterval(t);
        return;
      }
      // Six tool stages, then evidence review; preserve the existing seven-tick pacing.
      stageIndex += 1;
      scan.percent = Math.min(scan.percent + 15, 100);
      if (stageIndex < SCAN_STAGES.length) Object.assign(scan, SCAN_STAGES[stageIndex]);
      if (scan.percent === 100) {
        scan.status = "done";
        scan.stage = "finished";
        scan.error = this.opts.scanError ?? null;
        scan.finished_at = new Date().toISOString();
        clearInterval(t);
      }
      scan.counts = this.count(s, scan);
    }, this.step);
    this.timers.add(t);
    return id;
  }

  private findingsFor(s: Session): Finding[] {
    const list = (this.opts.findings ?? []).map((o, i) => {
      const f: Finding = {
        id: findingId(o, i), tools: ["semgrep"], rule_id: "rule", title: `Finding ${i}`, severity: "high", cwe: null,
        path: "app.js", start_line: 1, end_line: 1, start_col: null, end_col: null, file_sha256: "", message: "m",
        snippet: "", verdict: "likely_real", explanation: "Explanation. More text.",
        fix_recommendation: "Fix it this way. Then test.", suggested_patch: null, status: "new", web_url: null, ...o,
      };
      f.file_sha256 = s.manifest.get(f.path)?.sha256 ?? "";
      return f;
    });
    // Workspace: attach each finding to the uploaded file whose path ends with the finding's
    // path, so a scan works whether Lumina is the open folder or nested inside it. A finding
    // whose file was not uploaded is dropped, so scanning any other folder stays clean.
    if (s.target_type === "workspace" && s.manifest.size) {
      const keys = [...s.manifest.keys()];
      return list.flatMap((f) => {
        const match = keys.find((k) => k === f.path || k.endsWith(`/${f.path}`));
        if (!match) return [];
        const hash = s.manifest.get(match)!.sha256;
        const text = s.content.get(match);
        const fix = fixFor(match);
        if (text !== undefined && fix) {
          const line = locate(fix, text);
          if (line === undefined) return []; // the vulnerable lines are gone: fixed
          f.end_line += line - f.start_line;
          f.start_line = line; // follow them when edits above moved them
        } else {
          const baseline = s.baselineHash.get(match) ?? (s.baselineHash.set(match, hash), hash);
          if (hash !== baseline) return []; // the file changed since it was first scanned: fix applied
        }
        f.path = match;
        f.file_sha256 = hash;
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
  "sync_files", "clone_repo", "request_upload", "start_scan", "get_scan_status",
  "cancel_scan", "get_findings", "chat", "fix_findings"];

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
export const DEMO_FINDINGS: Partial<Finding>[] = [
  { path: "server/index.js", title: "SQL injection in catalog search", severity: "critical",
    rule_id: "javascript.express.sql-injection", cwe: "CWE-89", tools: ["semgrep"],
    start_line: 42, end_line: 42,
    message: "The product search term is concatenated directly into a SQL query.",
    snippet: "const q = `SELECT id, name, price FROM products WHERE name LIKE '%${req.query.q}%'`;",
    verdict: "likely_real",
    explanation: "The q search parameter reaches the database without escaping and needs no login, so a UNION payload can read any table — including customer emails, saved cards and password hashes.",
    fix_recommendation: "Use a parameterised query: db.all('... WHERE name LIKE ?', ['%' + req.query.q + '%'])." },
  { path: "server/routes/exec.js", title: "OS command injection", severity: "critical",
    rule_id: "javascript.lang.command-injection", cwe: "CWE-78", tools: ["semgrep"],
    start_line: 17, end_line: 17,
    message: "Untrusted input is passed to child_process.exec.",
    snippet: "exec(`ping -c 1 ${req.body.host}`);",
    verdict: "likely_real",
    explanation: "The host field is shelled out unescaped, letting an attacker run arbitrary commands.",
    fix_recommendation: "Use execFile with an argument array and validate the host against an allow-list." },
  { path: "server/config.js", title: "Hard-coded API credential", severity: "high",
    rule_id: "gitleaks.generic-api-key", cwe: "CWE-798", tools: ["gitleaks"],
    start_line: 8, end_line: 8,
    message: "A secret-looking token is committed in source.",
    snippet: "const STRIPE_KEY = \"sk_live_************************\";",
    verdict: "likely_real",
    explanation: "Secrets in source are exposed to anyone with repository access and leak through history.",
    fix_recommendation: "Move the key to an environment variable and rotate the exposed one." },
  { path: "server/views/profile.js", title: "Reflected XSS in profile page", severity: "medium",
    rule_id: "javascript.browser.dom-xss", cwe: "CWE-79", tools: ["semgrep"],
    start_line: 23, end_line: 23,
    message: "User input is written to innerHTML.",
    snippet: "el.innerHTML = params.get('name');",
    verdict: "likely_real",
    explanation: "The name parameter is rendered as HTML, so a crafted link can run script in the victim's session.",
    fix_recommendation: "Set textContent instead of innerHTML, or sanitise the value first." },
  { path: "server/utils/hash.js", title: "Weak password hash (MD5)", severity: "low",
    rule_id: "javascript.crypto.weak-hash", cwe: "CWE-327", tools: ["semgrep"],
    start_line: 5, end_line: 5,
    message: "MD5 is used to hash passwords.",
    snippet: "return crypto.createHash('md5').update(pw).digest('hex');",
    verdict: "likely_real",
    explanation: "MD5 is fast and broken for password storage; hashes can be brute-forced cheaply.",
    fix_recommendation: "Use a slow, salted KDF such as bcrypt, scrypt or argon2." },
  { path: "server/routes/download.js", title: "Path traversal in invoice download", severity: "high",
    rule_id: "javascript.express.path-traversal", cwe: "CWE-22", tools: ["semgrep"],
    start_line: 12, end_line: 12,
    message: "A request-supplied filename is joined onto a directory without validation.",
    snippet: "const data = fs.readFileSync(path.join(INVOICE_DIR, file));",
    verdict: "likely_real",
    explanation: "The file segment comes straight from the URL, so a value like ../../server/config.js walks out of the invoice folder and reads any file the server can open.",
    fix_recommendation: "Strip the path with path.basename(), or resolve and confirm the result still sits inside INVOICE_DIR before reading." },
  { path: "server/routes/import.js", title: "Server-side request forgery in image import", severity: "high",
    rule_id: "javascript.lang.ssrf", cwe: "CWE-918", tools: ["semgrep"],
    start_line: 9, end_line: 10,
    message: "A user-supplied URL is fetched with no host allow-list.",
    snippet: "https.get(req.body.url, (upstream) => upstream.pipe(res));",
    verdict: "likely_real",
    explanation: "The import URL is fetched server-side without checking its host, so an attacker can target internal addresses such as 169.254.169.254 and read cloud-metadata credentials.",
    fix_recommendation: "Parse the URL and allow only known external hosts (for example cdn.lumina.com) before fetching." },
  { path: "server/middleware/cors.js", title: "Overly permissive CORS policy", severity: "medium",
    rule_id: "javascript.express.permissive-cors", cwe: "CWE-942", tools: ["semgrep"],
    start_line: 7, end_line: 8,
    message: "A wildcard origin is sent together with Allow-Credentials.",
    snippet: "res.header(\"Access-Control-Allow-Origin\", \"*\");",
    verdict: "likely_real",
    explanation: "Returning a wildcard origin while allowing credentials lets any site make authenticated cross-origin calls to the API using a logged-in visitor's cookies.",
    fix_recommendation: "Echo only a vetted origin such as https://www.lumina.com instead of \"*\", or drop Allow-Credentials." },
  { path: "server/middleware/errors.js", title: "Stack trace exposed in API error", severity: "medium",
    rule_id: "javascript.express.stacktrace-exposure", cwe: "CWE-209", tools: ["semgrep"],
    start_line: 7, end_line: 7,
    message: "The error stack is serialised into the HTTP response.",
    snippet: "res.status(500).json({ error: err.message, stack: err.stack });",
    verdict: "likely_real",
    explanation: "Returning the raw message and stack trace leaks file paths, SQL fragments and dependency versions, handing an attacker a map of the backend.",
    fix_recommendation: "Send a generic message to the client and log the full error server-side instead." },
  { path: "server/session.js", title: "Session cookie missing HttpOnly and Secure", severity: "low",
    rule_id: "javascript.express.insecure-cookie", cwe: "CWE-614", tools: ["semgrep"],
    start_line: 9, end_line: 9,
    message: "A session cookie is set without HttpOnly, Secure or SameSite.",
    snippet: "res.cookie(\"sid\", sid, { maxAge: 86400000 });",
    verdict: "likely_real",
    explanation: "Without HttpOnly the session id is readable by page scripts (so any XSS steals it), and without Secure it is sent over plain HTTP where it can be sniffed.",
    fix_recommendation: "Set { httpOnly: true, secure: true, sameSite: \"lax\" } on the cookie." },
];

interface Fix {
  start_line: number;
  /** The vulnerable lines, so the fix still lands (and the finding still shows) after other edits moved them. */
  original: (string | RegExp)[];
  replacement: string;
}

/** The secure replacement for each planted finding, as whole-line edits over the
 * Lumina sample. Keyed by the finding's file; shown as a diff and applied on "Fix". */
const FIXES: Record<string, Fix> = {
  // SQL injection: parameterise the query and bind the search term (lines 42-43).
  "server/index.js": { start_line: 42,
    original: ["  const q = `SELECT id, name, email, phone, address, card_brand, card, exp, password FROM customers WHERE name LIKE '%${req.query.q}%'`;", "  db.all(q, (err, rows) => {"],
    replacement: '  const q = "SELECT id, name, price FROM products WHERE name LIKE ?";\n  db.all(q, ["%" + req.query.q + "%"], (err, rows) => {' },
  // Command injection: execFile with an argument array instead of a shell string.
  "server/routes/exec.js": { start_line: 17,
    original: ["  exec(`ping -c 1 ${host}`);"],
    replacement: '  require("child_process").execFile("ping", ["-c", "1", host]);' },
  // Hard-coded credential: read it from the environment.
  "server/config.js": { start_line: 8,
    original: [/^const STRIPE_KEY = "sk_live_\w+";$/],
    replacement: 'const STRIPE_KEY = process.env.STRIPE_KEY;' },
  // Reflected XSS: textContent escapes markup; innerHTML does not.
  "server/views/profile.js": { start_line: 23,
    original: ["  el.innerHTML = params.get('name');"],
    replacement: "  el.textContent = params.get('name');" },
  // Weak hash: scrypt is a slow, salted KDF built into Node's crypto.
  "server/utils/hash.js": { start_line: 5,
    original: ["  return crypto.createHash('md5').update(pw).digest('hex');"],
    replacement: '  return crypto.scryptSync(pw, "salt", 64).toString("hex");' },
  // Path traversal: basename() drops any directory components, so the read stays in INVOICE_DIR.
  "server/routes/download.js": { start_line: 12,
    original: ["  const data = fs.readFileSync(path.join(INVOICE_DIR, file));"],
    replacement: '  const data = fs.readFileSync(path.join(INVOICE_DIR, path.basename(file)));' },
  // SSRF: resolve the URL and allow only the CDN host before fetching it.
  "server/routes/import.js": { start_line: 9,
    original: ["  const target = req.body.url;", "  https.get(target, (upstream) => upstream.pipe(res));"],
    replacement: '  const { hostname } = new URL(req.body.url);\n  if (hostname !== "cdn.lumina.com") return res.status(400).json({ error: "host not allowed" });\n  https.get(req.body.url, (upstream) => upstream.pipe(res));' },
  // Permissive CORS: name a single trusted origin instead of a wildcard.
  "server/middleware/cors.js": { start_line: 7,
    original: ["  res.header(\"Access-Control-Allow-Origin\", \"*\");", "  res.header(\"Access-Control-Allow-Credentials\", \"true\");"],
    replacement: '  res.header("Access-Control-Allow-Origin", "https://www.lumina.com");\n  res.header("Access-Control-Allow-Credentials", "true");' },
  // Stack-trace exposure: return a generic message; log the real error server-side.
  "server/middleware/errors.js": { start_line: 7,
    original: ["  res.status(500).json({ error: err.message, stack: err.stack });"],
    replacement: '  res.status(500).json({ error: "Something went wrong. Please try again." });' },
  // Insecure cookie: set HttpOnly, Secure and SameSite so scripts and plain HTTP can't take it.
  "server/session.js": { start_line: 9,
    original: ["  res.cookie(\"sid\", sid, { maxAge: 86400000 });"],
    replacement: '  res.cookie("sid", sid, { maxAge: 86400000, httpOnly: true, secure: true, sameSite: "lax" });' },
};

/** The canned fix for a workspace path; the path may be nested (`shop/server/index.js`), so match by suffix. */
function fixFor(p: string) {
  const key = Object.keys(FIXES).find((k) => p === k || p.endsWith(`/${k}`));
  return key ? FIXES[key] : undefined;
}

/** The line (1-based) where a fix's vulnerable code is now, nearest to where it was planted. */
function locate(fix: Fix, text: string): number | undefined {
  const lines = text.split(/\r?\n/);
  const at = lines.map((_, i) => i + 1).filter((n) => fix.original.every((want, k) =>
    typeof want === "string" ? lines[n - 1 + k] === want : want.test(lines[n - 1 + k] ?? "")));
  return at.sort((a, b) => Math.abs(a - fix.start_line) - Math.abs(b - fix.start_line))[0];
}

/** Stable across scans and restarts, so ignored findings stay ignored. */
export function findingId(f: Partial<Finding>, index: number): string {
  return `f-${createHash("sha256").update(`${f.path ?? index}|${f.rule_id ?? index}`).digest("hex").slice(0, 10)}`;
}

/** Scan wordings the shared keyword rules leave to the agent. */
function scanRequest(text: string): ChatCommand | undefined {
  const only = text.match(/^\s*(?:please )?(?:scan|check) (?:only|just) (?:the )?([\w./-]+?)(?: folder)?[.!]?\s*$/i);
  if (only) return { kind: "scan", paths: [only[1]] };
  if (/^\s*scan(?: now| it)?[.!]?\s*$/i.test(text)) return { kind: "scan" };
  if (/\bsafe\?/i.test(text)) return { kind: "scan", confirm: true };
  return undefined;
}

/** Keep the text of every uploaded file that has a canned fix (the archive is a tar.gz). */
async function readFixable(archive: Buffer, into: Map<string, string>) {
  const parser = new tar.Parser({ onReadEntry: (e) => {
    const file = e.path.replace(/^\.\//, "");
    if (!fixFor(file)) return e.resume();
    const chunks: Buffer[] = [];
    e.on("data", (c: Buffer) => chunks.push(c));
    e.on("end", () => into.set(file, Buffer.concat(chunks).toString("utf8")));
  } });
  await new Promise<void>((resolve, reject) => {
    parser.on("end", resolve);
    parser.on("error", reject);
    parser.end(archive);
  });
}

if (require.main === module) {
  const h = new FakeHarness({ port: Number(process.env.PORT ?? 7357), stepMs: 1000, findings: DEMO_FINDINGS });
  h.start().then((url) => console.log(`Reconix scanner on ${url} (token: ${h.token})`));
}
