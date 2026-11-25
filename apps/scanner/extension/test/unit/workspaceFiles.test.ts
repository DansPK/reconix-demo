import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { DEMO_FINDINGS } from "../../server/server";
import { collectFiles, isSafeContractPath, toContractPath } from "../../src/workspaceFiles";
import { extractLumina } from "./helpers";


async function makeWorkspace(files: Record<string, string | Buffer>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "reconix-ws-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, ...name.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return dir;
}

async function collectPaths(rootDir: string, extraExcludes: string[] = [], maxFileSizeKB = 1024): Promise<string[]> {
  return (await collectFiles({ rootDir, maxFileSizeKB, extraExcludes })).map((f) => f.path);
}

test("toContractPath returns a forward-slash path relative to the root", () => {
  const root = path.join(tmpdir(), "ws");
  assert.equal(toContractPath(root, path.join(root, "src", "routes", "a.js")), "src/routes/a.js");
  assert.equal(toContractPath(root, path.join(root, ".env")), ".env");
});

test("toContractPath rejects the root itself and paths that escape it", () => {
  const root = path.join(tmpdir(), "ws");
  assert.throws(() => toContractPath(root, root), /outside the workspace/);
  assert.throws(() => toContractPath(root, path.join(root, "..", "other", "a.js")), /outside the workspace/);
  assert.throws(() => toContractPath(root, path.join(root, "..")), /outside the workspace/);
});

test("toContractPath keeps names that only start with two dots", () => {
  const root = path.join(tmpdir(), "ws");
  assert.equal(toContractPath(root, path.join(root, "..hidden")), "..hidden");
});

test("collectFiles returns sorted entries with size and sha256", async (t) => {
  const dir = await makeWorkspace({ "src/b.js": "b", "a.js": "hello" });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = await collectFiles({ rootDir: dir, maxFileSizeKB: 1024, extraExcludes: [] });
  assert.deepEqual(files, [
    { path: "a.js", sizeBytes: 5, sha256: createHash("sha256").update("hello").digest("hex") },
    { path: "src/b.js", sizeBytes: 1, sha256: createHash("sha256").update("b").digest("hex") },
  ]);
});

test("collectFiles honours .gitignore, the built-in excludes and extraExcludes", async (t) => {
  const dir = await makeWorkspace({
    ".gitignore": "logs/\n*.tmp\n",
    ".git/config": "x",
    "node_modules/pkg/index.js": "x",
    "logs/app.log": "x",
    "notes.tmp": "x",
    "dist/out.js": "x",
    "src/app.js": "x",
    ".env": "KEY=x",
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await collectPaths(dir, ["dist/"]), [".env", ".gitignore", "src/app.js"]);
});

test("collectFiles skips the built-in folders at any depth", async (t) => {
  const dir = await makeWorkspace({
    "build/a.js": "x",
    "out/a.js": "x",
    "target/a.js": "x",
    "bin/a.js": "x",
    "obj/a.js": "x",
    ".venv/a.py": "x",
    "venv/a.py": "x",
    "pkg/__pycache__/a.pyc": "x",
    ".idea/a.xml": "x",
    ".vscode/settings.json": "x",
    "pkg/dist/a.js": "x",
    "pkg/src/a.js": "x",
    "distribution/a.js": "x",
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await collectPaths(dir), ["distribution/a.js", "pkg/src/a.js"]);
});

test("collectFiles reads .gitignore in every folder, each for its own folder and below", async (t) => {
  const dir = await makeWorkspace({
    ".gitignore": "*.log\n",
    "app.log": "x",
    "pkg/.gitignore": "secret.txt\n/local/\n",
    "pkg/secret.txt": "x",
    "pkg/local/a.js": "x",
    "pkg/deep/local/a.js": "x",
    "pkg/deep/debug.log": "x",
    "other/secret.txt": "x",
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await collectPaths(dir), [".gitignore", "other/secret.txt", "pkg/.gitignore", "pkg/deep/local/a.js"]);
});

test("collectFiles skips binary files and files over the size limit", async (t) => {
  const dir = await makeWorkspace({
    "image.bin": Buffer.from([0x89, 0x50, 0x00, 0x47]),
    "big.txt": "x".repeat(2048),
    "small.txt": "x".repeat(1000),
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await collectPaths(dir, [], 1), ["small.txt"]);
});

test("collectFiles skips symlinks", { skip: process.platform === "win32" }, async (t) => {
  const outside = await makeWorkspace({ "secret.txt": "x" });
  const dir = await makeWorkspace({ "a.js": "x" });
  t.after(() => Promise.all([rm(dir, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await symlink(path.join(outside, "secret.txt"), path.join(dir, "link.txt"));
  await symlink(outside, path.join(dir, "linked-dir"));
  assert.deepEqual(await collectPaths(dir), ["a.js"]);
});

test("collectFiles stops when the signal is aborted", async (t) => {
  const dir = await makeWorkspace({ "a.js": "x" });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collectFiles({ rootDir: dir, maxFileSizeKB: 1024, extraExcludes: [], signal: controller.signal }));
});

test("collectFiles on Lumina includes every file a finding points at", async (t) => {
  const dir = await extractLumina();
  t.after(() => rm(path.dirname(dir), { recursive: true, force: true }));
  const collected = new Set(await collectPaths(dir, [], 2048));
  for (const f of DEMO_FINDINGS) assert.ok(collected.has(f.path!), `${f.path} was not collected`);
});

test("isSafeContractPath accepts plain workspace-relative paths", () => {
  for (const p of ["src/app.js", ".env", "..hidden", "a/..b/c.js", "package-lock.json"]) {
    assert.ok(isSafeContractPath(p), p);
  }
});

test("isSafeContractPath rejects paths that could leave the workspace", () => {
  for (const p of ["", "/etc/passwd", "../../.ssh/id_rsa", "src/../../x", "./a.js", "a//b", "a/", "..\\..\\x", "C:/x", "c:x"]) {
    assert.equal(isSafeContractPath(p), false, p);
  }
});
