// The demo's story, end to end over MCP: scan Lumina, fix one, rescan; fix all, rescan.
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { test } from "node:test";
import { applyEdits, fixAllIds, mergeEdits } from "../../src/fixLogic";
import { McpBackend } from "../../src/backend/McpBackend";
import { mergeFindings } from "../../src/findingsLogic";
import type { AgentEvent, FixResult } from "../../src/shared/contract";
import { hashFile } from "../../src/workspaceFiles";
import { DEMO_FINDINGS, LUMINA_REPO } from "../../server/server";
import { extractLumina, scan, startDemo } from "./helpers";

/** What the controller does on Apply: only to a file that still has the hash the fix was made for. */
async function apply(root: string, result: FixResult): Promise<void> {
  for (const file of result.files) {
    const full = path.join(root, file.path);
    assert.equal(await hashFile(full), file.fileSha256, file.path);
    const { kept, dropped } = mergeEdits(file.edits);
    assert.deepEqual(dropped, []);
    await fs.writeFile(full, applyEdits(await fs.readFile(full, "utf8"), kept));
  }
}

for (const eol of ["\n", "\r\n"]) {
  test(`scan Lumina, fix one, rescan drops it; fix all, rescan clears (${JSON.stringify(eol)})`, async (t) => {
    const demo = await startDemo();
    const root = await extractLumina();
    t.after(async () => {
      await demo.stop();
      await fs.rm(path.dirname(root), { recursive: true, force: true });
    });
    for (const p of new Set(DEMO_FINDINGS.map((f) => f.path!))) {
      const full = path.join(root, p);
      await fs.writeFile(full, (await fs.readFile(full, "utf8")).replace(/\r?\n/g, eol));
    }
    const { backend } = demo;
    const session = await backend.createSession();

    const first = await scan(backend, session.id, root);
    assert.equal(first.summary.status, "COMPLETED");
    assert.equal(first.findings.length, DEMO_FINDINGS.length);
    assert.deepEqual(first.findings.map((f) => f.line), DEMO_FINDINGS.map((f) => f.start_line), "on the planted lines");
    assert.deepEqual(first.summary.counts, { CRITICAL: 2, HIGH: 3, MEDIUM: 3, LOW: 2, UNKNOWN: 0, NONE: 0 });

    const sqli = first.findings.find((f) => f.cwe?.includes("CWE-89"))!;
    const events: AgentEvent[] = [];
    const one = await backend.fixFindings(session.id, [sqli.id], (e) => events.push(e));
    assert.deepEqual(one.results.map((r) => r.status), ["FIXED"]);
    assert.ok(events.some((e) => e.kind === "tool" && e.text === "Edit server/index.js"));
    const before = await hashFile(path.join(root, sqli.path));
    await apply(root, one);
    assert.notEqual(await hashFile(path.join(root, sqli.path)), before);

    const second = await scan(backend, session.id, root);
    assert.equal(second.findings.length, DEMO_FINDINGS.length - 1);
    assert.ok(!second.findings.some((f) => f.id === sqli.id));

    const { ids, manual, leftOut } = fixAllIds(mergeFindings(second.findings));
    assert.deepEqual([ids.length, manual, leftOut], [DEMO_FINDINGS.length - 1, 0, 0]);
    const all = await backend.fixFindings(session.id, ids, () => undefined);
    assert.ok(all.results.every((r) => r.status === "FIXED"));
    await apply(root, all);

    const third = await scan(backend, session.id, root);
    assert.deepEqual(third.findings, []);
    assert.equal((await backend.summarizeFindings(third.summary.scanId)).card.total, 0);
    // A new session (or a restarted server) sees the fixed files as fixed too.
    const fresh = await scan(backend, (await backend.createSession()).id, root);
    assert.deepEqual(fresh.findings, []);
  });
}

test("Fix all from a full scan clears Lumina, and edits above a finding do not misplace its fix", async (t) => {
  const demo = await startDemo();
  const root = await extractLumina();
  t.after(async () => {
    await demo.stop();
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });
  const exec = path.join(root, "server/routes/exec.js");
  await fs.writeFile(exec, `// moved\n// down\n${await fs.readFile(exec, "utf8")}`);
  const session = await demo.backend.createSession();
  const { findings } = await scan(demo.backend, session.id, root);
  assert.equal(findings.find((f) => f.path === "server/routes/exec.js")?.line, 19);
  const result = await demo.backend.fixFindings(session.id, findings.map((f) => f.id), () => undefined);
  assert.equal(result.files.length, 10);
  await apply(root, result);
  assert.match(await fs.readFile(exec, "utf8"), /execFile\("ping", \["-c", "1", host\]\);/);
  assert.deepEqual((await scan(demo.backend, session.id, root)).findings, []);
});

test("a comment elsewhere in the file keeps the finding; deleting the vulnerable line drops it", async (t) => {
  const demo = await startDemo();
  t.after(demo.stop);
  const root = await extractLumina();
  t.after(() => fs.rm(path.dirname(root), { recursive: true, force: true }));
  const file = path.join(root, "server/utils/hash.js");
  const session = await demo.backend.createSession();
  const has = async () => (await scan(demo.backend, session.id, root)).findings.some((f) => f.path === "server/utils/hash.js");
  assert.ok(await has());
  await fs.appendFile(file, "// reviewed\n");
  assert.ok(await has());
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).split("\n").filter((l) => !l.includes("createHash('md5')")).join("\n"));
  assert.ok(!(await has()));
});

test("a scan of one folder serves only its findings; another project has none", async (t) => {
  const demo = await startDemo();
  t.after(demo.stop);
  const root = await extractLumina();
  t.after(() => fs.rm(path.dirname(root), { recursive: true, force: true }));
  const session = await demo.backend.createSession();
  const { findings, summary } = await scan(demo.backend, session.id, root, ["server/middleware"]);
  assert.deepEqual(findings.map((f) => f.path), ["server/middleware/cors.js", "server/middleware/errors.js"]);
  assert.equal(summary.counts.MEDIUM, 2);
  const other = await extractLumina();
  t.after(() => fs.rm(path.dirname(other), { recursive: true, force: true }));
  await fs.rm(path.join(other, "server"), { recursive: true });
  assert.deepEqual((await scan(demo.backend, (await demo.backend.createSession()).id, other)).findings, []);
});

test("the GitHub scan is scripted: Lumina's repository only, with no connection but the local server", async (t) => {
  const demo = await startDemo();
  t.after(demo.stop);
  const { backend } = demo;
  const session = await backend.createSession("lumina-store/lumina-site");
  const realFetch = globalThis.fetch;
  const hosts = new Set<string>();
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    hosts.add(new URL(url instanceof Request ? url.url : url).hostname);
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    await assert.rejects(backend.cloneRepo(session.id, "https://github.com/acme/app"), /no access to https:\/\/github\.com\/acme\/app/);
    await backend.cloneRepo(session.id, `${LUMINA_REPO}.git`);
    let done = await backend.startScan(session.id);
    await new Promise<void>((resolve) => backend.watchScan(done.scanId, (s) => {
      done = s;
      if (s.status !== "RUNNING") resolve();
    }));
    assert.equal(done.status, "COMPLETED");
    const { items } = await backend.getFindings(done.scanId);
    assert.equal(items.length, DEMO_FINDINGS.length);
    await assert.rejects(backend.fixFindings(session.id, [items[0].id], () => undefined), /open folder/);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual([...hosts].filter((h) => h !== "127.0.0.1"), []);
});

test("a server that is not on this computer is refused before anything is sent", async () => {
  for (const serverUrl of ["https://scanner.lumina.com", "http://127.0.0.1.lumina.com:7357", "http://localhost@lumina.com"]) {
    const backend = new McpBackend({ serverUrl, getToken: async () => "t" });
    assert.equal((await backend.status()).state, "disconnected");
    await assert.rejects(backend.listSessions(), /must run on this computer/);
  }
});
