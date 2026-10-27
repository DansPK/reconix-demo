/* The Security knowledge routes called directly, with the CLI's stand-in (e2e/knowledge-cli-stub.mjs,
   which keeps the CLI's contract over a temporary folder and refuses an environment that holds
   anything but PATH, HOME and the knowledge folder and key file, and an upload copy that isn't a
   0600 file in a 0700 folder): the session (the proxy's 401, the handlers' own 401), the
   Origin on every change, the 10 MB cap counted while the body is read (413), the extension
   allow-list and the .doc message, the CLI's exit codes (0 → 201, 2 → 400 with its message,
   1 → 500 with a fixed one), the temp copy removed every time, the original's headers, the id
   checks, and the stand-in honoured only with RECONIX_KNOWLEDGE_CLI_TEST=1. */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";
import { cleanName, DOC_REFUSED, MAX_UPLOAD_BYTES, TOO_LARGE, TYPE_REFUSED, uploadProblem } from "@/lib/knowledge/rules";
import { contentDisposition, downloadName } from "@/lib/knowledge/original";

import { writeKnowledge } from "./knowledge-fixtures";

const TOKEN = "knowledge-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));

const list = await import("@/app/api/knowledge/route");
const one = await import("@/app/api/knowledge/[id]/route");
const original = await import("@/app/api/knowledge/[id]/original/route");
const { proxy } = await import("@/proxy");
const { cliCommand, cliEnv } = await import("@/lib/knowledge/cli");

const STUB = path.join(__dirname, "..", "e2e", "knowledge-cli-stub.mjs");
const ORIGIN = "http://127.0.0.1:3100";
// the keys set here, restored one by one: os.tmpdir() reads the real environment, so process.env
// must stay the real object (never replaced by a copy)
const KEYS = [
  "RECONIX_WEB_TOKEN", "RECONIX_KNOWLEDGE_DIR", "RECONIX_KNOWLEDGE_KEY_FILE", "RECONIX_KNOWLEDGE_CLI_TEST",
  "RECONIX_KNOWLEDGE_CLI", "RECONIX_PYTHON", "TMPDIR", "LLM_API_KEY", "LLM_BASE_URL",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const BASE = tmpdir();
let root = "";
let knowledge = "";
let uploads = "";
let clock = Date.now();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 120_000)); // a new upload minute per test
  root = mkdtempSync(path.join(BASE, "reconix-knowledge-api-"));
  knowledge = path.join(root, "knowledge");
  uploads = path.join(root, "tmp");
  process.env.RECONIX_WEB_TOKEN = TOKEN;
  process.env.RECONIX_KNOWLEDGE_DIR = knowledge;
  process.env.RECONIX_KNOWLEDGE_KEY_FILE = path.join(root, "knowledge.key");
  process.env.RECONIX_KNOWLEDGE_CLI_TEST = "1";
  process.env.RECONIX_KNOWLEDGE_CLI = STUB;
  process.env.TMPDIR = uploads; // the upload copies go here (os.tmpdir() reads it on every call)
  process.env.LLM_API_KEY = "sk-never-to-the-cli"; // the stand-in refuses any key it wasn't promised
  process.env.LLM_BASE_URL = "http://127.0.0.1:9/v1";
  mkdirSync(uploads, { mode: 0o700 });
  cookie = sessionValue(TOKEN);
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(root, { recursive: true, force: true });
});

// --- requests ------------------------------------------------------------------------------------

const headersFor = (origin: string | null, extra: Record<string, string> = {}) => {
  const h: Record<string, string> = { host: "127.0.0.1:3100", ...extra };
  if (origin !== null) h.origin = origin;
  return h;
};
const get = (url: string) => new Request(`${ORIGIN}${url}`, { headers: headersFor(null) });
const del = (url: string, origin: string | null = ORIGIN) => new Request(`${ORIGIN}${url}`, { method: "DELETE", headers: headersFor(origin) });

/** A multipart upload of `files` (name → content), built as a browser builds it. */
async function upload(files: Record<string, string | Uint8Array<ArrayBuffer>>, { origin = ORIGIN as string | null, field = "file" } = {}) {
  const form = new FormData();
  for (const [name, content] of Object.entries(files)) form.append(field, new Blob([content]), name);
  const body = new Request(ORIGIN, { method: "POST", body: form });
  const type = body.headers.get("content-type")!;
  const bytes = new Uint8Array(await body.arrayBuffer());
  return list.POST(new Request(`${ORIGIN}/api/knowledge`, { method: "POST", body: bytes, headers: headersFor(origin, { "content-type": type }) }));
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const listing = async () => (await (await list.GET(get("/api/knowledge"))).json()) as { state: string; items: { id: string; name: string; source: string; original: boolean; kind: string }[] };
const leftovers = () => (existsSync(uploads) ? readdirSync(uploads) : []);

// --- the rules (pure) ----------------------------------------------------------------------------

describe("the upload rules", () => {
  it("allow the seven extensions, tell a .doc to become a .docx, and cap the size", () => {
    for (const name of ["a.docx", "a.pdf", "a.txt", "a.md", "a.json", "a.yaml", "a.yml", "A.PDF"]) expect(uploadProblem({ name, size: 10 }), name).toBeNull();
    expect(uploadProblem({ name: "old.doc", size: 10 })).toBe(DOC_REFUSED);
    expect(DOC_REFUSED).toContain("Save it as .docx first");
    for (const name of ["a.exe", "a.html", "a", ".md", "a.md.exe"]) expect(uploadProblem({ name, size: 10 }), name).toBe(TYPE_REFUSED);
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 })).toBe(TOO_LARGE);
    expect(uploadProblem({ name: "a.pdf", size: 0 })).toBe("The file is empty.");
  });

  it("clean a name to its base name, one line, no markup or leading dash, at most 120 characters", () => {
    expect(cleanName("C:\\Users\\me\\run<book>.md")).toBe("runbook.md");
    expect(cleanName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(cleanName("--help.md")).toBe("help.md");
    expect(cleanName("a\u0000b\u202ec\nd.json")).toBe("abcd.json");
    expect(cleanName("<>.pdf")).toBe("upload.pdf");
    const long = cleanName(`${"x".repeat(300)}.yaml`);
    expect([...long].length).toBe(120);
    expect(long.endsWith(".yaml")).toBe(true);
  });

  it("name the original safely in its Content-Disposition (RFC 5987)", () => {
    expect(downloadName('a"b;c.pdf', "pdf")).toBe("abc.pdf");
    expect(downloadName("notes", "md")).toBe("notes.md");
    expect(downloadName("cfg.yml", "yaml")).toBe("cfg.yml");
    expect(contentDisposition("pdf", "rapport été.pdf")).toBe(`inline; filename="rapport ete.pdf"; filename*=UTF-8''rapport%20%C3%A9t%C3%A9.pdf`);
    expect(contentDisposition("docx", "日本.docx")).toBe(`attachment; filename="knowledge.docx"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.docx`);
    expect(contentDisposition("txt", "it's (1).txt")).toContain("filename*=UTF-8''it%27s%20%281%29.txt");
  });
});

// --- the CLI's process -----------------------------------------------------------------------

describe("the CLI's process", () => {
  it("is the stand-in only with RECONIX_KNOWLEDGE_CLI_TEST=1, else python -m reconix.knowledge", () => {
    expect(cliCommand({ RECONIX_KNOWLEDGE_CLI_TEST: "1", RECONIX_KNOWLEDGE_CLI: STUB, RECONIX_PYTHON: "/py" })).toEqual({ program: process.execPath, prefix: [STUB] });
    expect(cliCommand({ RECONIX_KNOWLEDGE_CLI: STUB, RECONIX_PYTHON: "/py" })).toEqual({ program: "/py", prefix: ["-m", "reconix.knowledge"] });
    expect(cliCommand({ RECONIX_KNOWLEDGE_CLI_TEST: "0", RECONIX_KNOWLEDGE_CLI: STUB, RECONIX_PYTHON: "/py" }).prefix).toEqual(["-m", "reconix.knowledge"]);
  });

  it("gets a minimal environment: never an LLM_* key or the launch token", () => {
    const env = cliEnv({ PATH: "/bin", HOME: "/home/me", LLM_API_KEY: "sk-x", RECONIX_WEB_TOKEN: "t", RECONIX_KNOWLEDGE_DIR: "/k", OTHER: "1" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", RECONIX_KNOWLEDGE_DIR: "/k", PYTHONUTF8: "1" });
  });
});

// --- session and origin ------------------------------------------------------------------------

describe("access", () => {
  const through = (url: string, method = "GET", session: string | null = null) =>
    proxy(new NextRequest(`${ORIGIN}${url}`, { method, headers: { host: "127.0.0.1:3100", ...(session !== null ? { cookie: `${COOKIE}=${session}` } : {}) } }));
  const signedIn = () => sessionValue(TOKEN);

  it("the proxy answers 401 without a session (or with an old role-prefixed cookie) and passes a session on, on every knowledge route", async () => {
    for (const [url, method] of [["/api/knowledge", "GET"], ["/api/knowledge", "POST"], [`/api/knowledge/${"a".repeat(32)}`, "DELETE"], [`/api/knowledge/${"a".repeat(32)}/original`, "GET"]]) {
      expect((await through(url, method)).status, `${method} ${url} anon`).toBe(401);
      expect((await through(url, method, `operator.${signedIn()}`)).status, `${method} ${url} old cookie`).toBe(401);
      expect((await through(url, method, signedIn())).status, `${method} ${url} signed in`).toBe(200); // passed on
    }
  });

  it("the proxy leaves the page's policy off a knowledge file's original (it sets its own), and only there", async () => {
    const id = "a".repeat(32);
    expect((await through(`/api/knowledge/${id}/original`, "GET", signedIn())).headers.get("content-security-policy")).toBeNull();
    expect((await through("/api/knowledge", "GET", signedIn())).headers.get("content-security-policy")).toContain("default-src 'self'");
    expect((await through(`/api/knowledge/${id}/original/x`, "GET", signedIn())).headers.get("content-security-policy")).toContain("default-src 'self'");
    expect((await through(`/api/knowledge/${id}/original`, "GET")).status).toBe(401);
  });

  it("the handlers refuse a missing session and an old role-prefixed cookie themselves", async () => {
    for (const who of ["", `operator.${sessionValue(TOKEN)}`]) {
      cookie = who;
      const res = await list.GET(get("/api/knowledge"));
      expect(res.status).toBe(401);
      expect((await res.json()).detail).toBe("Sign in first.");
      expect((await upload({ "a.md": "# a" })).status).toBe(401);
      expect((await one.DELETE(del(`/api/knowledge/${"a".repeat(32)}`), ctx("a".repeat(32)))).status).toBe(401);
      expect((await original.GET(get(`/api/knowledge/${"a".repeat(32)}/original`), ctx("a".repeat(32)))).status).toBe(401);
    }
    expect(existsSync(knowledge)).toBe(false);
  });

  it("a change needs the page's own Origin", async () => {
    expect((await upload({ "a.md": "# a" }, { origin: null })).status).toBe(403);
    expect((await upload({ "a.md": "# a" }, { origin: "http://evil.example" })).status).toBe(403);
    const [id] = writeKnowledge(knowledge, [{ name: "a.md", chunks: ["a"] }]);
    expect((await one.DELETE(del(`/api/knowledge/${id}`, null), ctx(id))).status).toBe(403);
    expect((await one.DELETE(del(`/api/knowledge/${id}`, "http://127.0.0.1:3101"), ctx(id))).status).toBe(403);
    expect((await listing()).items).toHaveLength(1);
  });
});

// --- the list ------------------------------------------------------------------------------------

describe("GET /api/knowledge", () => {
  it("lists nothing without a folder", async () => {
    expect(await listing()).toEqual({ state: "missing", items: [], max: 50 });
  });

  it("lists the files newest first; an older entry reads as the terminal's, with no original; no path", async () => {
    writeKnowledge(knowledge, [{ name: "old-runbook.md", chunks: ["Rotate the keys."] }]);
    const added = await upload({ "policy.pdf": "%PDF-1.4 stand-in" });
    expect(added.status).toBe(201);
    const body = await listing();
    expect(body.items.map((i) => [i.name, i.source, i.original, i.kind])).toEqual([
      ["policy.pdf", "web", true, "pdf"],
      ["old-runbook.md", "terminal", false, "md"],
    ]);
    expect(JSON.stringify(body)).not.toContain(root);
  });
});

// --- uploading -----------------------------------------------------------------------------------

describe("POST /api/knowledge", () => {
  it("adds a file through the CLI (201), names it from the base name, and removes the temp copy", async () => {
    const res = await upload({ "run<book>.md": "# Runbook\nRotate the quokka keys every 30 days." });
    expect(res.status).toBe(201);
    const { source } = await res.json();
    expect(source).toMatchObject({ name: "runbook.md", kind: "md", source: "web", original: true, chunks: 1 });
    expect(JSON.stringify(source)).not.toContain(root);
    expect(leftovers()).toEqual([]);
    // what the AI Assistant reads: the passages, in the folder the CLI was given
    expect(readFileSync(path.join(knowledge, `${source.id}.json`), "utf8")).toContain("Rotate the quokka keys");
  });

  it("refuses a .doc with the .docx message, other types, an empty file, and two files", async () => {
    const doc = await upload({ "old.doc": "binary" });
    expect(doc.status).toBe(400);
    expect((await doc.json()).detail).toBe(DOC_REFUSED);
    expect((await (await upload({ "page.html": "<b>x</b>" })).json()).detail).toBe(TYPE_REFUSED);
    expect((await upload({ "empty.md": "" })).status).toBe(400);
    expect((await upload({ "a.md": "a", "b.md": "b" })).status).toBe(400);
    expect((await upload({ "a.md": "a" }, { field: "other" })).status).toBe(400);
    const plain = await list.POST(new Request(`${ORIGIN}/api/knowledge`, { method: "POST", body: "a", headers: headersFor(ORIGIN, { "content-type": "text/plain" }) }));
    expect(plain.status).toBe(415);
    expect(existsSync(knowledge)).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  it("answers 413 past 10 MB, counting the body as it is read (no Content-Length to trust)", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(97);
    expect((await upload({ "big.txt": big })).status).toBe(413);
    // streamed with no Content-Length: the count still stops it
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 200_000).fill(97)]), "huge.txt");
    const built = new Request(ORIGIN, { method: "POST", body: form });
    const bytes = new Uint8Array(await built.arrayBuffer());
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, (offset += 64 * 1024)));
      },
    });
    const res = await list.POST(
      new Request(`${ORIGIN}/api/knowledge`, { method: "POST", body: stream, headers: headersFor(ORIGIN, { "content-type": built.headers.get("content-type")! }), duplex: "half" } as RequestInit),
    );
    expect(res.status).toBe(413);
    expect(existsSync(knowledge)).toBe(false);
  });

  it("maps the CLI's exit codes: 2 → 400 with its message, 1 → 500 with a fixed one; the copy is removed", async () => {
    const refused = await upload({ "[stub:refuse].md": "text" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).detail).toBe("The stand-in refused this file.");
    const failed = await upload({ "[stub:fail].md": "text" });
    expect(failed.status).toBe(500);
    const detail = (await failed.json()).detail as string;
    expect(detail).toMatch(/^The knowledge tool failed/);
    expect(detail).not.toContain("Traceback");
    expect(leftovers()).toEqual([]);
  });

  it("can't start a CLI that isn't there: a fixed 500", async () => {
    process.env.RECONIX_KNOWLEDGE_CLI = path.join(root, "missing.py");
    process.env.RECONIX_PYTHON = path.join(root, "no-python");
    const res = await upload({ "a.md": "a" });
    expect(res.status).toBe(500);
    expect((await res.json()).detail).toMatch(/could not start/);
    expect(leftovers()).toEqual([]);
  });

  it("takes ten uploads a minute", async () => {
    for (let i = 0; i < 10; i++) expect((await upload({ [`f${i}.md`]: `file ${i}` })).status).toBe(201);
    const eleventh = await upload({ "f10.md": "one too many" });
    expect(eleventh.status).toBe(429);
    vi.setSystemTime((clock += 61_000));
    expect((await upload({ "f10.md": "next minute" })).status).toBe(201);
  });

  it("runs one upload at a time", async () => {
    const [a, b] = await Promise.all([upload({ "a.md": "a" }), upload({ "b.md": "b" })]);
    expect([a.status, b.status].sort()).toEqual([201, 429]);
  });
});

// --- the original and removing ------------------------------------------------------------------

describe("GET /api/knowledge/<id>/original", () => {
  const open = (id: string) => original.GET(get(`/api/knowledge/${id}/original`), ctx(id));

  it("returns the original with its type, inline in a sandbox for PDF and text, a download for DOCX", async () => {
    const pdf = (await (await upload({ "Policy été.pdf": "%PDF-1.4 stand-in" })).json()).source;
    const res = await open(pdf.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="Policy ete.pdf"; filename*=UTF-8''Policy%20%C3%A9t%C3%A9.pdf`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'; frame-ancestors 'none'");
    expect(await res.text()).toBe("%PDF-1.4 stand-in");

    const kinds: [string, string][] = [
      ["notes.md", "text/plain; charset=utf-8"],
      ["notes.txt", "text/plain; charset=utf-8"],
      ["data.json", "application/json"],
      ["cfg.yml", "text/plain; charset=utf-8"],
    ];
    for (const [name, type] of kinds) {
      const item = (await (await upload({ [name]: `{"a": 1} ${name}` })).json()).source;
      const r = await open(item.id);
      expect(r.headers.get("content-type"), name).toBe(type);
      expect(r.headers.get("content-disposition"), name).toMatch(/^inline; /);
      expect(r.headers.get("content-security-policy"), name).toBe("sandbox; default-src 'none'; frame-ancestors 'none'");
    }
    vi.setSystemTime((clock += 61_000));
    const docx = (await (await upload({ "report.docx": "PK stand-in" })).json()).source;
    const word = await open(docx.id);
    expect(word.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(word.headers.get("content-disposition")).toMatch(/^attachment; filename="report.docx"/);
    expect(word.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(word.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("checks the id, and answers 404 for a file that isn't listed or kept no original", async () => {
    expect((await open("../../etc/passwd")).status).toBe(400);
    expect((await open("A".repeat(32))).status).toBe(400);
    expect((await open("a".repeat(32))).status).toBe(404);
    const [old] = writeKnowledge(knowledge, [{ name: "old.md", chunks: ["x"] }]);
    const res = await open(old);
    expect(res.status).toBe(404);
    expect((await res.json()).detail).toMatch(/No original/);
  });
});

describe("DELETE /api/knowledge/<id>", () => {
  it("removes a file through the CLI, and checks the id first", async () => {
    const item = (await (await upload({ "a.md": "a" })).json()).source;
    expect((await one.DELETE(del(`/api/knowledge/bad`), ctx("bad"))).status).toBe(400);
    expect((await one.DELETE(del(`/api/knowledge/${"b".repeat(32)}`), ctx("b".repeat(32)))).status).toBe(404);
    const res = await one.DELETE(del(`/api/knowledge/${item.id}`), ctx(item.id));
    expect(res.status).toBe(200);
    expect((await listing()).items).toEqual([]);
    expect(existsSync(path.join(knowledge, `${item.id}.json`))).toBe(false);
    expect(existsSync(path.join(knowledge, `${item.id}.orig`))).toBe(false);
  });
});
