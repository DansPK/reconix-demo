/* POST /api/assistant with a knowledge folder (RECONIX_KNOWLEDGE_DIR, a temporary folder written
   here as the TUI's /add-on writes it): a relevant question sends the passages to the stand-in
   model inside the fence (checked in the request it received) and the reply's `meta` names the
   files, which the saved reply keeps; an irrelevant question, or no folder at all, sends none and
   names none; the folder is never written. A stand-in model runs on a free local port;
   conversations go to a temporary folder too. */
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";
import { KNOWLEDGE_TITLE } from "@/lib/assistant/context";
import { type Frame, parseFrame } from "@/lib/assistant/protocol";
import { MASK } from "@/lib/assistant/redact";

import { writeKnowledge } from "./knowledge-fixtures";

const TOKEN = "route-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));
vi.mock("next/server", async (load) => ({ ...(await load<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));

const { POST } = await import("@/app/api/assistant/route");
const one = await import("@/app/api/assistant/conversations/[id]/route");
const { addProvider } = await import("@/lib/assistant/models/store");

// --- a stand-in model that records what it was sent ------------------------------------------
let seen: { role: string; content: string }[][] = [];
let model: Server;
let modelUrl = "";
beforeAll(async () => {
  model = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push((JSON.parse(body) as { messages: { role: string; content: string }[] }).messages);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "Rotate them monthly." } }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
  modelUrl = `http://127.0.0.1:${(model.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((done) => model.close(() => done())));

const saved = { ...process.env };
let root = "";
let knowledge = "";
let clock = Date.now();
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 120_000)); // a new rate-limit minute per test
  root = mkdtempSync(path.join(tmpdir(), "reconix-knowledge-route-"));
  knowledge = path.join(root, "knowledge");
  process.env.RECONIX_WEB_TOKEN = TOKEN;
  process.env.RECONIX_DATA_DIR = "sample-data";
  process.env.RECONIX_STALE_AFTER_HOURS = "0";
  process.env.RECONIX_ASSISTANT_DIR = path.join(root, "assistant");
  process.env.RECONIX_KNOWLEDGE_DIR = knowledge;
  // the stand-in, saved as + Model saves a model (the web reads none from its environment)
  await addProvider({ name: "Stand-in", preset: "custom", baseUrl: modelUrl, models: ["test-model"], activate: true });
  cookie = sessionValue(TOKEN);
  seen = [];
});
afterEach(() => {
  vi.useRealTimers();
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const ORIGIN = "http://127.0.0.1:3100";
const request = (url: string, init: RequestInit & { origin?: string | null } = {}) => {
  const headers: Record<string, string> = { host: "127.0.0.1:3100", "content-type": "application/json" };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new Request(`http://127.0.0.1:3100${url}`, { ...init, headers });
};
const ask = async (question: string) => {
  const res = await POST(request("/api/assistant", { method: "POST", body: JSON.stringify({ uid: null, question }) }));
  expect(res.status).toBe(200);
  return (await res.text())
    .split("\n")
    .map(parseFrame)
    .filter((f): f is Frame => f !== null);
};
const metaOf = (frames: Frame[]) => frames[0] as Extract<Frame, { t: "meta" }>;
const savedReply = async (id: string) => {
  const res = await one.GET(request(`/api/assistant/conversations/${id}`, { origin: null }), { params: Promise.resolve({ id }) });
  return (await res.json()).conversation.messages[1];
};

const RUNBOOK = {
  name: "quokka-runbook.md",
  chunks: ["Rotate the zephyrine quokka keys every 30 days. The vault login is password=hunter2-quokka.", "Escalations go to the on-call lead."],
};
const HANDBOOK = { name: "handbook.pdf", chunks: Array.from({ length: 20 }, (_, i) => `Handbook section ${i}: lunch hours and parking rules.`) };

/** Every file in the folder with its size, mode, times and inode. */
const snapshot = () =>
  readdirSync(knowledge)
    .sort()
    .map((n) => {
      const s = statSync(path.join(knowledge, n));
      return [n, s.size, s.mode, s.mtimeMs, s.ino];
    });

describe("POST /api/assistant with /add-on knowledge", () => {
  it("sends the relevant passages inside the fence and names their files in meta and the saved reply", async () => {
    writeKnowledge(knowledge, [RUNBOOK, HANDBOOK]);
    const before = snapshot();
    const frames = await ask("How often do we rotate the zephyrine quokka keys?");
    const meta = metaOf(frames);
    expect(meta).toMatchObject({ t: "meta", knowledge: ["quokka-runbook.md"] });
    expect(frames.filter((f) => f.t === "card").every((f) => f.t === "card" && f.card.kind !== "notice")).toBe(true);

    const system = seen[0][0].content;
    const tag = /<\/(assessment_data_[0-9a-f]{8})>\s*$/.exec(system)![1];
    const inside = system.slice(system.lastIndexOf(`<${tag}>`), system.lastIndexOf(`</${tag}>`));
    expect(inside).toContain(`${KNOWLEDGE_TITLE}:\n[quokka-runbook.md #0] Rotate the zephyrine quokka keys every 30 days.`);
    expect(inside).toContain(`password=${MASK}`);
    expect(system).not.toContain("hunter2");
    expect(system).not.toContain(knowledge); // names only, never the folder
    expect(system).not.toContain("handbook.pdf");
    expect(system).toContain("internal knowledge: passages of files the operator added with /add-on");

    expect(await savedReply(meta.conversationId)).toMatchObject({ state: "done", content: "Rotate them monthly.", knowledge: ["quokka-runbook.md"] });
    expect(snapshot()).toEqual(before); // read-only
  });

  it("sends and names nothing for an irrelevant question", async () => {
    writeKnowledge(knowledge, [RUNBOOK, HANDBOOK]);
    const frames = await ask("What waits on my approval?");
    const meta = metaOf(frames);
    expect(meta).not.toHaveProperty("knowledge");
    expect(seen[0][0].content).not.toContain(KNOWLEDGE_TITLE);
    expect(seen[0][0].content).not.toContain("internal knowledge: passages of files"); // the knowledge rule
    expect(await savedReply(meta.conversationId)).not.toHaveProperty("knowledge");
  });

  it("answers as before without a knowledge folder, or with a refused one", async () => {
    let frames = await ask("How often do we rotate the zephyrine quokka keys?");
    expect(metaOf(frames)).not.toHaveProperty("knowledge");
    expect(frames.at(-1)).toEqual({ t: "done" });
    if (process.platform !== "win32") {
      writeKnowledge(knowledge, [RUNBOOK, HANDBOOK]);
      chmodSync(knowledge, 0o777);
      frames = await ask("How often do we rotate the zephyrine quokka keys?");
      expect(metaOf(frames)).not.toHaveProperty("knowledge");
      expect(seen[1][0].content).not.toContain(KNOWLEDGE_TITLE);
      expect(statSync(knowledge).mode & 0o777).toBe(0o777); // left as it was
    }
  });
});
