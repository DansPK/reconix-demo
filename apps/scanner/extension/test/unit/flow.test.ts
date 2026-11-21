import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { after, before, test } from "node:test";
import { listArchive } from "../../src/archive";
import { HarnessClient, TOKEN_REJECTED } from "../../src/client";
import { prepareWorkspace, TooLargeError, watchToEnd } from "../../src/scanFlow";
import { hashFile } from "../../src/workspaceFiles";
import { FakeHarness } from "../../server/server";
import { makeTree } from "./helpers";
import * as os from "os";
import * as tar from "tar";

const settings = { maxFileSizeKB: 2048, maxUploadMB: 200, extraExcludes: [] };
let fake: FakeHarness;

before(async () => {
  fake = new FakeHarness({ stepMs: 30, findings: [{ path: "app.js" }] });
  await fake.start();
});
after(() => fake.stop());

test("a valid token connects; a bad one gives the 401 message without leaking the token", async () => {
  const ok = new HarnessClient(fake.url, fake.token);
  await ok.connect();
  assert.ok((await ok.listSessions()).sessions);
  await ok.close();
  const bad = new HarnessClient(fake.url, "wrong-token-123");
  await assert.rejects(bad.connect(), (e: Error) => e.message === TOKEN_REJECTED && !e.message.includes("wrong-token"));
});

test("unreachable server gives a clear message", async () => {
  const c = new HarnessClient("http://127.0.0.1:1", "t");
  await assert.rejects(c.connect(), /cannot be reached/);
});

test("tool errors come back as readable messages", async () => {
  const c = new HarnessClient(fake.url, fake.token);
  await assert.rejects(c.getSession("nope"), /session not found/);
  await c.close();
});

test("first scan uploads everything; rescan sends only the changed file", async () => {
  const root = await makeTree({ "app.js": "a", "lib/b.js": "b", "lib/c.js": "c" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");

  const first = await prepareWorkspace(c, session_id, root, settings);
  assert.deepEqual(first.uploaded.sort(), ["app.js", "lib/b.js", "lib/c.js"]);
  assert.deepEqual(await archiveNames(), ["app.js", "lib/b.js", "lib/c.js"]);
  const { scan_id } = await c.startScan(session_id, { upload_id: first.uploadId, deleted_paths: first.deleted });
  const seen: number[] = [];
  const summary = await watchToEnd(c, scan_id, (p) => seen.push(p));
  assert.equal(summary.status, "done");
  assert.ok(seen.length > 0);

  await fs.writeFile(path.join(root, "lib/b.js"), "changed");
  await fs.rm(path.join(root, "lib/c.js"));
  const second = await prepareWorkspace(c, session_id, root, settings);
  assert.deepEqual(second.uploaded, ["lib/b.js"]);
  assert.deepEqual(second.deleted, ["lib/c.js"]);
  assert.deepEqual(await archiveNames(), ["lib/b.js"]);
  await c.startScan(session_id, { upload_id: second.uploadId, deleted_paths: second.deleted });
  await new Promise((r) => setTimeout(r, 200));

  const third = await prepareWorkspace(c, session_id, root, settings);
  assert.equal(third.nothingChanged, true);
  await c.close();
});

test("upload errors: wrong hash is a clear error, an expired link is retried once", async () => {
  const root = await makeTree({ "x.js": "x" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  fake.forceUploadStatus = 400;
  await assert.rejects(prepareWorkspace(c, session_id, root, settings), /did not match its size or hash/);
  fake.forceUploadStatus = 403;
  const ok = await prepareWorkspace(c, session_id, root, settings);
  assert.ok(ok.uploadId);
  await c.close();
});

test("archive over the limit stops with sizes and largest folders", async () => {
  const big = Array.from({ length: 50 }, (_, i) => [`vendor/lib/f${i}.js`, randomText(40_000)]);
  const root = await makeTree(Object.fromEntries([...big, ["a.js", "a"]]));
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  await assert.rejects(prepareWorkspace(c, session_id, root, { ...settings, maxUploadMB: 1 }),
    (e: Error) => e instanceof TooLargeError && /vendor\/lib\//.test(e.message) && /MB/.test(e.message));
  await c.close();
});

test("a dropped connection during watch recovers and returns the final result", async () => {
  const root = await makeTree({ "app.js": "a" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  const p = await prepareWorkspace(c, session_id, root, settings);
  const { scan_id } = await c.startScan(session_id, { upload_id: p.uploadId });
  fake.dropNextWatch = true;
  const messages: string[] = [];
  const summary = await watchToEnd(c, scan_id, (_p, m) => messages.push(m));
  assert.equal(summary.status, "done");
  assert.equal(fake.calls.filter((x) => x.name === "watch_scan" && x.args.scan_id === scan_id).length >= 1, true);
  assert.ok(fake.calls.some((x) => x.name === "get_scan_status" && x.args.scan_id === scan_id));
  await c.close();
});

test("cancel stops a running scan", async () => {
  const root = await makeTree({ "app.js": "a" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  const p = await prepareWorkspace(c, session_id, root, settings);
  const { scan_id } = await c.startScan(session_id, { upload_id: p.uploadId });
  const watching = watchToEnd(c, scan_id, () => undefined);
  await c.cancelScan(scan_id);
  assert.equal((await watching).status, "cancelled");
  await c.close();
});

test("source scans report the current six-tool pipeline without changing finding attribution", async () => {
  const h = new FakeHarness({ stepMs: 100, findings: [{ path: "app.js", tools: ["semgrep"] }] });
  await h.start();
  const c = new HarnessClient(h.url, h.token);
  try {
    const root = await makeTree({ "app.js": "const query = input;" });
    const { session_id } = await c.createSession("workspace");
    const prepared = await prepareWorkspace(c, session_id, root, settings);
    const { scan_id } = await c.startScan(session_id, { upload_id: prepared.uploadId });
    const stages: string[] = [];
    const percentages: number[] = [];
    const result = await watchToEnd(c, scan_id, (percent, message) => {
      const stage = message.split(" · ")[0].split(":")[0];
      if (stages.at(-1) !== stage) stages.push(stage);
      percentages.push(percent);
    });
    assert.deepEqual(stages, [
      "Semgrep", "Gitleaks", "Trivy", "Grype", "OSV-Scanner", "Syft",
      "Correlate findings and review evidence",
    ]);
    assert.ok(percentages.every((percent, i) => i === 0 || percent >= percentages[i - 1]));
    assert.equal(result.status, "done");
    assert.equal(result.stage, "finished");
    assert.equal(result.percent, 100);
    assert.deepEqual(result.counts, { high: 1 });
    const { findings } = await c.getFindings(session_id);
    assert.deepEqual(findings.map((f) => f.tools), [["semgrep"]]);
  } finally {
    await c.close();
    await h.stop();
  }
});

async function archiveNames() {
  const data = fake.lastUploadArchive()!;
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "arc-")), "a.tar.gz");
  await fs.writeFile(file, data);
  void tar;
  return (await listArchive(file)).sort();
}

function randomText(n: number) {
  let s = "";
  while (s.length < n) s += Math.random().toString(36).slice(2);
  return s.slice(0, n);
}

test("fix_findings returns edits for the uploaded file with progress, and the chat can ask for fixes", async () => {
  const dir = await makeTree({ "app.js": "const q = 'SELECT ' + input;\n" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  await assert.rejects(c.fixFindings(session_id, ["f0"], () => undefined), /finding not found/);
  const prepared = await prepareWorkspace(c, session_id, dir, settings);
  const { scan_id } = await c.startScan(session_id, { upload_id: prepared.uploadId });
  await watchToEnd(c, scan_id, () => undefined);
  const progress: string[] = [];
  const r = await c.fixFindings(session_id, ["f0"], (_p, m) => progress.push(m));
  const p = r.files[0];
  assert.equal(p.path, "app.js");
  assert.equal(p.file_sha256, await hashFile(path.join(dir, "app.js")));
  assert.deepEqual(p.edits, [{ start_line: 1, end_line: 1, replacement: "// fixed" }]);
  assert.equal(r.results[0].status, "fixed");
  assert.equal(progress.length, 8);
  assert.deepEqual(JSON.parse(progress[3]), { file: "app.js", kind: "tool", text: "Edit app.js" });
  const reply = await c.chat(session_id, "fix all of them");
  assert.deepEqual(reply.action?.finding_ids, ["f0"]);
  await c.close();
});

test("a file that already holds its canned fix has no finding, even in a fresh session", async () => {
  const h = new FakeHarness({ stepMs: 10, findings: [{ path: "server/config.js", start_line: 1, end_line: 1 }] });
  await h.start();
  const c = new HarnessClient(h.url, h.token);
  const scanOnce = async (text: string) => {
    const root = await makeTree({ "server/config.js": text });
    const { session_id } = await c.createSession("workspace");
    const p = await prepareWorkspace(c, session_id, root, settings);
    const { scan_id } = await c.startScan(session_id, { upload_id: p.uploadId, deleted_paths: p.deleted });
    await watchToEnd(c, scan_id, () => {});
    return (await c.getFindings(session_id)).total;
  };
  try {
    assert.equal(await scanOnce('const STRIPE_KEY = "sk_live_x";\n'), 1);
    assert.equal(await scanOnce("const STRIPE_KEY = process.env.STRIPE_KEY;\r\n"), 0);
  } finally {
    await c.close();
    await h.stop();
  }
});
