import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { list } from "tar";
import { createArchive } from "../../src/archive";
import type { Backend } from "../../src/backend/Backend";
import type { McpBackend } from "../../src/backend/McpBackend";
import { fetchAllFindings, liveRefresh, manifestFingerprint, runScanFlow } from "../../src/scanFlow";
import type { FileEntry, Finding, FindingsQuery, ScanSummary } from "../../src/shared/contract";
import { makeTree, scanOptions, startDemo } from "./helpers";

/** A folder with one finding's file. */
async function demoWorkspace(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const dir = await makeTree({ "package.json": "{}", "server/utils/hash.js": "  return crypto.createHash('md5').update(pw).digest('hex');\n" });
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function start(t: { after: (fn: () => Promise<void>) => void }, stepMs = 2): Promise<McpBackend> {
  const demo = await startDemo({ stepMs });
  t.after(async () => demo.stop());
  return demo.backend;
}

test("runScanFlow collects, scans and resolves with the completed summary", async (t) => {
  const dir = await demoWorkspace(t);
  const backend = await start(t);
  const sessionId = (await backend.createSession()).id;
  const updates: ScanSummary[] = [];

  const result = await runScanFlow(backend, scanOptions(dir, sessionId, updates));

  assert.ok(result);
  assert.equal(result.status, "COMPLETED");
  assert.equal(updates[0].stage, "COLLECTING");
  assert.deepEqual(updates.slice(0, 3).map((u) => u.stage), ["COLLECTING", "ARCHIVING", "UPLOADING"]);
  assert.equal(updates[updates.length - 1].status, "COMPLETED");
  const page = await backend.getFindings(result.scanId, { includeLikelyFalsePositives: true });
  assert.ok(page.total > 0);
  assert.ok(page.items.every((f) => f.path === "server/utils/hash.js"), "only findings for collected files");
});

test("runScanFlow cancels the backend scan when aborted mid-scan", async (t) => {
  const dir = await demoWorkspace(t);
  const backend = await start(t, 20);
  const sessionId = (await backend.createSession()).id;
  const controller = new AbortController();
  const updates: ScanSummary[] = [];
  const flow = runScanFlow(backend, {
    ...scanOptions(dir, sessionId, updates, controller.signal),
    onProgress: (scan) => {
      updates.push(scan);
      if (scan.status === "RUNNING" && scan.stage === "SCANNING" && scan.scanId) controller.abort();
    },
  });

  const result = await flow;
  assert.equal(result?.status, "CANCELLED");
});

test("runScanFlow rejects when aborted before the scan starts", async (t) => {
  const dir = await demoWorkspace(t);
  const backend = await start(t);
  const sessionId = (await backend.createSession()).id;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runScanFlow(backend, scanOptions(dir, sessionId, [], controller.signal)));
});

test("runScanFlow rejects an empty folder", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "reconix-flow-empty-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const backend = await start(t);
  const sessionId = (await backend.createSession()).id;
  await assert.rejects(runScanFlow(backend, scanOptions(dir, sessionId, [])), /No files to scan/);
});

test("fetchAllFindings reads every page", async () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `f-${i}` }) as Finding);
  const offsets: number[] = [];
  const backend = {
    getFindings: async (_scanId: string, query: FindingsQuery = {}) => {
      const offset = query.offset ?? 0;
      offsets.push(offset);
      return { items: items.slice(offset, offset + 2), total: items.length, offset, limit: 2 };
    },
  } as unknown as Backend;
  const all = await fetchAllFindings(backend, "scan-1", { includeLikelyFalsePositives: true });
  assert.deepEqual(all.items.map((f) => f.id), items.map((f) => f.id));
  assert.equal(all.withoutFile, 0);
  assert.deepEqual(offsets, [0, 2, 4]);
});

test("runScanFlow gives up on a backend that never confirms the cancel", async (t) => {
  const dir = await demoWorkspace(t);
  const real = await start(t, 1000);
  const sessionId = (await real.createSession()).id;
  // Accepts the cancel but never reports CANCELLED.
  const backend = Object.assign(Object.create(real) as McpBackend, { cancelScan: async () => undefined });
  const controller = new AbortController();
  const updates: ScanSummary[] = [];
  const flow = runScanFlow(backend, {
    ...scanOptions(dir, sessionId, updates, controller.signal),
    cancelGraceMs: 20,
    onProgress: (scan) => {
      updates.push(scan);
      if (scan.progress === 0 && scan.scanId) controller.abort();
    },
  });
  const result = await flow;
  assert.ok(result);
  assert.equal(result.status, "CANCELLED");
  assert.equal(updates.filter((u) => u.status === "CANCELLED").length, 1);
  await real.cancelScan(result.scanId);
});

test("runScanFlow reports a confirmed cancel only once, even after the grace period", async (t) => {
  const dir = await demoWorkspace(t);
  const backend = await start(t, 1000);
  const sessionId = (await backend.createSession()).id;
  const controller = new AbortController();
  const updates: ScanSummary[] = [];
  const result = await runScanFlow(backend, {
    ...scanOptions(dir, sessionId, updates, controller.signal),
    cancelGraceMs: 10,
    onProgress: (scan) => {
      updates.push(scan);
      if (scan.progress === 0 && scan.scanId) controller.abort();
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(result?.status, "CANCELLED");
  assert.equal(updates.filter((u) => u.status === "CANCELLED").length, 1);
});

test("runScanFlow stops before syncing when shouldScan says no", async (t) => {
  const dir = await demoWorkspace(t);
  const backend = await start(t);
  const sessionId = (await backend.createSession()).id;
  let synced = false;
  const spy = Object.assign(Object.create(backend) as McpBackend, {
    syncFiles: async () => {
      synced = true;
      return { missing: [] };
    },
  });
  let seen: { count: number; fingerprint: string } | undefined;
  const result = await runScanFlow(spy, {
    ...scanOptions(dir, sessionId, []),
    shouldScan: (files, fingerprint) => {
      seen = { count: files.length, fingerprint };
      return false;
    },
  });
  assert.equal(result, undefined);
  assert.equal(synced, false);
  assert.equal(seen?.count, 2);
  assert.match(seen?.fingerprint ?? "", /^[0-9a-f]{64}$/);
});

test("manifestFingerprint changes with any path or content hash, not with order", () => {
  const a = { path: "a.js", sizeBytes: 1, sha256: "1".repeat(64) };
  const b = { path: "b.js", sizeBytes: 1, sha256: "2".repeat(64) };
  assert.equal(manifestFingerprint([a, b]), manifestFingerprint([b, a]));
  assert.notEqual(manifestFingerprint([a, b]), manifestFingerprint([a, { ...b, sha256: "3".repeat(64) }]));
  assert.notEqual(manifestFingerprint([a, b]), manifestFingerprint([a]));
});

test("liveRefresh runs at most once per window, never twice at once, and stops cleanly", async () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let runs = 0;
  let active = 0;
  const live = liveRefresh(async () => {
    runs++;
    active++;
    assert.equal(active, 1, "never two at once");
    await wait(80); // longer than the window
    active--;
  }, 50);
  for (let i = 0; i < 5; i++) live.poke(); // a burst: one run now
  await wait(10);
  live.poke(); // its timer fires while the first run is still going: runs once more after it
  await wait(250);
  assert.equal(runs, 2);
  live.poke();
  await live.stop(); // the waiting run is dropped
  await wait(100);
  assert.equal(runs, 2);
});

test("only files the sync offered are packed, whatever the server asks for, as relative tar entries", async (t) => {
  const dir = await demoWorkspace(t);
  const real = await start(t);
  const sessionId = (await real.createSession()).id;
  const packed: string[] = [];
  const backend = Object.assign(Object.create(real) as McpBackend, {
    // A misbehaving server asks for a file outside the workspace, and one the sync never named.
    syncFiles: async (sessionId: string, files: FileEntry[]) => {
      await real.syncFiles(sessionId, files);
      return { missing: ["../outside.txt", "/etc/passwd", "not-offered.js", "package.json", "server/utils/hash.js"] };
    },
    uploadCode: async (_sessionId: string, archivePath: string) => {
      await list({ file: archivePath, onReadEntry: (entry) => void packed.push(entry.path.replace(/^\.\//, "")) });
    },
  });
  await runScanFlow(backend, scanOptions(dir, sessionId, []));
  assert.deepEqual(packed.sort(), ["package.json", "server/utils/hash.js"]);
});

test("createArchive packs a path starting with @ as a file, not as another archive", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "reconix-archive-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "@scope", "pkg"), { recursive: true });
  await writeFile(path.join(dir, "@scope", "pkg", "index.ts"), "export {};\n");
  await writeFile(path.join(dir, "@notes.md"), "# notes\n");
  const out = path.join(dir, "out.tar.gz");
  await createArchive(dir, ["@scope/pkg/index.ts", "@notes.md"], out);
  const names: string[] = [];
  await list({ file: out, onReadEntry: (entry) => void names.push(entry.path) });
  assert.deepEqual(names.sort(), ["./@notes.md", "./@scope/pkg/index.ts"], "relative entries; core strips the ./");
});
