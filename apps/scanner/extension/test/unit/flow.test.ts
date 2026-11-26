import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { after, before, test } from "node:test";
import * as tar from "tar";
import { McpBackend } from "../../src/backend/McpBackend";
import { TOKEN_REJECTED } from "../../src/client";
import { runScanFlow } from "../../src/scanFlow";
import type { AgentEvent, ScanSummary } from "../../src/shared/contract";
import { hashFile } from "../../src/workspaceFiles";
import { makeTree, scan, scanOptions, startDemo } from "./helpers";

let demo: Awaited<ReturnType<typeof startDemo>>;
let backend: McpBackend;

before(async () => {
  demo = await startDemo({ stepMs: 20, findings: [{ path: "app.js" }] });
  backend = demo.backend;
});
after(() => demo.stop());

test("a valid token connects; a bad or missing one offers Set Token without leaking it", async () => {
  assert.deepEqual(await backend.status(), { state: "connected", label: "Connected to MCP Server" });
  const status = (token?: string) => new McpBackend({ serverUrl: demo.fake.url, getToken: async () => token }).status();
  const action = { label: "Set Token", command: "reconix.setToken" };
  assert.deepEqual(await status("wrong-token-123"), { state: "disconnected", reason: TOKEN_REJECTED, action });
  assert.deepEqual(await status(), { state: "disconnected", reason: "No token is set.", action });
});

test("an unreachable or missing server says so, with the button that helps", async () => {
  const status = async (serverUrl: string) => {
    const s = await new McpBackend({ serverUrl, getToken: async () => "t" }).status();
    assert.ok(s.state === "disconnected");
    return s;
  };
  const down = await status("http://127.0.0.1:1");
  assert.match(down.reason, /cannot be reached/);
  assert.equal(down.action?.command, "reconix.reconnect");
  assert.equal((await status("")).action?.command, "reconix.openSettings");
});

test("sessions: create, rename, list newest first, history, delete; a lost one reads as SESSION_NOT_FOUND", async () => {
  const a = await backend.createSession("  First   scan ");
  assert.equal(a.title, "First scan");
  const b = await backend.createSession();
  assert.equal((await backend.renameSession(a.id, "Lumina")).title, "Lumina");
  await assert.rejects(backend.renameSession(a.id, "  "), /can't be empty/);
  await backend.chat(b.id, "what did you find?");
  assert.deepEqual((await backend.getSession(b.id)).messages.map((m) => m.role), ["user", "assistant"]);
  assert.deepEqual((await backend.getSession(a.id)).messages, [], "each session has its own history");
  assert.ok((await backend.listSessions()).some((s) => s.id === b.id));
  await backend.deleteSession(b.id);
  await assert.rejects(backend.getSession(b.id), /^Error: SESSION_NOT_FOUND|SESSION_NOT_FOUND/);
});

test("first scan uploads everything; rescan sends only the changed file", async () => {
  const root = await makeTree({ "app.js": "a", "lib/b.js": "b", "lib/c.js": "c" });
  const session = await backend.createSession();
  const first = await scan(backend, session.id, root);
  assert.equal(first.summary.status, "COMPLETED");
  assert.deepEqual(await archiveNames(), ["app.js", "lib/b.js", "lib/c.js"]);

  await fs.writeFile(path.join(root, "lib/b.js"), "changed");
  await fs.rm(path.join(root, "lib/c.js"));
  await scan(backend, session.id, root);
  assert.deepEqual(await archiveNames(), ["lib/b.js"]);

  const uploads = demo.fake.uploads.size;
  await scan(backend, session.id, root);
  assert.equal(demo.fake.uploads.size, uploads, "nothing changed: nothing is sent");
});

test("upload errors: wrong hash is a clear error, an expired link is retried once", async () => {
  const root = await makeTree({ "x.js": "x" });
  const session = await backend.createSession();
  demo.fake.forceUploadStatus = 400;
  await assert.rejects(scan(backend, session.id, root), /did not match its size or hash/);
  demo.fake.forceUploadStatus = 403;
  assert.equal((await scan(backend, session.id, root)).summary.status, "COMPLETED");
});

test("archive over the limit stops before the upload", async () => {
  const noise = Buffer.from(Array.from({ length: 2_000_000 }, () => 1 + Math.floor(Math.random() * 255)));
  const root = await makeTree({ "app.js": noise });
  const session = await backend.createSession();
  await assert.rejects(runScanFlow(backend, { ...scanOptions(root, session.id), maxUploadMB: 1 }), /MB, over the 1 MB limit/);
});

test("a dropped connection during a scan recovers and returns the final result", async () => {
  const root = await makeTree({ "app.js": "a" });
  const session = await backend.createSession();
  let dropped = false;
  const result = await runScanFlow(backend, {
    ...scanOptions(root, session.id),
    onProgress: (s) => {
      if (s.scanId && !dropped) demo.fake.dropNextStatus = dropped = true;
    },
  });
  assert.ok(dropped && !demo.fake.dropNextStatus);
  assert.equal(result?.status, "COMPLETED");
});

test("cancel stops a running scan", async () => {
  const root = await makeTree({ "app.js": "a" });
  const session = await backend.createSession();
  const abort = new AbortController();
  const result = await runScanFlow(backend, {
    ...scanOptions(root, session.id, [], abort.signal),
    onProgress: (s) => { if (s.scanId) abort.abort(); },
  });
  assert.equal(result?.status, "CANCELLED");
});

test("source scans report the current six-tool pipeline without changing finding attribution", async () => {
  const h = await startDemo({ stepMs: 60, findings: [{ path: "app.js", tools: ["semgrep"] }] });
  try {
    const root = await makeTree({ "app.js": "const query = input;" });
    const session = await h.backend.createSession();
    const updates: ScanSummary[] = [];
    const result = (await runScanFlow(h.backend, scanOptions(root, session.id, updates)))!;
    const running = updates.filter((s) => s.scanId && s.status === "RUNNING");
    const details = [...new Set(running.map((s) => s.detail!.split(" · ")[0]))];
    assert.deepEqual(details, ["Semgrep", "Gitleaks", "Trivy", "Grype", "OSV-Scanner", "Syft", "Correlate findings and review evidence"]);
    assert.deepEqual(new Set(running.slice(0, -1).map((s) => s.stage)), new Set(["SCANNING"]));
    assert.equal(running.at(-1)?.stage, "ANALYZING");
    assert.ok(running.every((s, i) => i === 0 || s.progress >= running[i - 1].progress));
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.stage, "DONE");
    assert.equal(result.progress, 100);
    assert.equal(result.counts.HIGH, 1);
    assert.deepEqual((await h.backend.getFindings(result.scanId)).items.map((f) => f.tools), [["SEMGREP"]]);
  } finally {
    await h.stop();
  }
});

test("findings show while the scan runs, not reviewed yet", async () => {
  const h = await startDemo({ stepMs: 40, findings: [{ path: "app.js" }] });
  try {
    const root = await makeTree({ "app.js": "x" });
    const session = await h.backend.createSession();
    let live: Promise<{ verdict: string; explanation?: string }[]> | undefined;
    const result = await runScanFlow(h.backend, {
      ...scanOptions(root, session.id),
      onProgress: (s) => {
        if (s.status === "RUNNING" && s.counts.HIGH === 1) live ??= h.backend.getFindings(s.scanId).then((p) => p.items);
      },
    });
    assert.deepEqual((await live)?.map((f) => [f.verdict, f.explanation]), [["UNVERIFIED", undefined]]);
    assert.equal((await h.backend.getFindings(result!.scanId)).items[0].verdict, "LIKELY_TRUE_POSITIVE");
  } finally {
    await h.stop();
  }
});

test("fixFindings returns edits for the uploaded file with a live transcript, and the chat can ask for fixes", async () => {
  const dir = await makeTree({ "app.js": "const q = 'SELECT ' + input;\n" });
  const session = await backend.createSession();
  await assert.rejects(backend.fixFindings(session.id, ["f-0"], () => undefined), /finding not found/);
  const { findings } = await scan(backend, session.id, dir);
  const events: AgentEvent[] = [];
  const r = await backend.fixFindings(session.id, [findings[0].id], (e) => events.push(e));
  assert.deepEqual(r.files, [{
    path: "app.js", fileSha256: await hashFile(path.join(dir, "app.js")), edits: [{ startLine: 1, endLine: 1, replacement: "// fixed" }],
  }]);
  assert.equal(r.results[0].status, "FIXED");
  assert.deepEqual(events.map((e) => e.kind), ["status", "start", "tool", "thinking", "thinking", "tool", "result", "done", "status"]);
  assert.deepEqual(events[5], { file: "app.js", kind: "tool", text: "Edit app.js" });
  assert.deepEqual((await backend.chat(session.id, "fix all of them")).run, { kind: "fix", findingIds: [findings[0].id] });
});

test("stopping the fix agent rejects as an AbortError", async () => {
  const dir = await makeTree({ "app.js": "x\n" });
  const session = await backend.createSession();
  const { findings } = await scan(backend, session.id, dir);
  const abort = new AbortController();
  await assert.rejects(backend.fixFindings(session.id, [findings[0].id], () => abort.abort(), abort.signal),
    (e: Error) => e.name === "AbortError");
});

test("a file that already holds its canned fix has no finding, even in a fresh session", async () => {
  const h = await startDemo({ findings: [{ path: "server/config.js", start_line: 1, end_line: 1 }] });
  const count = async (text: string) => {
    const root = await makeTree({ "server/config.js": text });
    return (await scan(h.backend, (await h.backend.createSession()).id, root)).findings.length;
  };
  try {
    assert.equal(await count('const STRIPE_KEY = "sk_live_x";\n'), 1);
    assert.equal(await count("const STRIPE_KEY = process.env.STRIPE_KEY;\r\n"), 0);
  } finally {
    await h.stop();
  }
});

async function archiveNames(): Promise<string[]> {
  const file = path.join(await makeTree({}), "a.tar.gz");
  await fs.writeFile(file, demo.fake.lastUploadArchive()!);
  const names: string[] = [];
  await tar.list({ file, onReadEntry: (e) => void names.push(e.path.replace(/^\.\//, "")) });
  return names.sort();
}
