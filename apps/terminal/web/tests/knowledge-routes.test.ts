/* The Security knowledge routes on the Core API: the list, an upload, a removal and the graph,
   against the fake Core API. The page gets names and counts, never a passage. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";
import { type FakeCore, startFakeCore } from "./fakes/core-api-server";

const TOKEN = "route-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));

const list = await import("@/app/api/knowledge/route");
const one = await import("@/app/api/knowledge/[id]/route");
const graph = await import("@/app/api/knowledge/graph/route");
const content = await import("@/app/api/knowledge/[id]/passages/route");
const about = await import("@/app/api/knowledge/about/route");
const reingest = await import("@/app/api/knowledge/reingest/route");
const { resetSessions } = await import("@/lib/api/sessions");

let core: FakeCore;
beforeAll(async () => {
  core = await startFakeCore();
});
afterAll(() => core.close());

const saved = { ...process.env };
beforeEach(() => {
  process.env.RECONIX_WEB_TOKEN = TOKEN;
  process.env.RECONIX_CORE_API = core.url;
  cookie = sessionValue(TOKEN);
  resetSessions();
  core.addOns.length = 0;
  core.calls.length = 0;
  core.reingesting = false;
});
afterEach(() => {
  process.env = { ...saved };
});

const ORIGIN = "http://127.0.0.1:3100";
const request = (url: string, init: RequestInit & { origin?: string | null } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", "127.0.0.1:3100");
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  return new Request(`http://127.0.0.1:3100${url}`, { ...init, headers });
};
function upload(name: string, text: string) {
  const form = new FormData();
  form.append("file", new File([text], name));
  return list.POST(request("/api/knowledge", { method: "POST", body: form }));
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Security knowledge on the Core API", () => {
  it("uploads to the API, lists it, and graphs what it talks about", async () => {
    const res = await upload("notes.md", "SQL injection, CWE-89, in the search form.");
    expect(res.status).toBe(201);
    const { source } = await res.json();
    expect(source).toMatchObject({ name: "notes.md", kind: "md", chunks: 1, source: "web", ingested: false }); // waits for Ingest
    expect(core.calls.some((c) => c.path === "/knowledge-add-ons" && c.method === "POST")).toBe(true);

    const listed = await (await list.GET(request("/api/knowledge", { origin: null }))).json();
    expect(listed).toMatchObject({ state: "ok", max: 50, items: [expect.objectContaining({ id: source.id })] });

    const g = await graph.GET(request("/api/knowledge/graph", { origin: null }));
    const body = await g.json();
    expect(body.references[source.id]).toEqual([{ type: "CWE", ref_id: "CWE-89", label: "CWE-89", count: 1 }]);
    expect(JSON.stringify(body)).not.toContain("search form"); // never a passage
  });

  it("passes the API's refusal on, and removes a document", async () => {
    const empty = await upload("empty.md", "   ");
    expect(empty.status).toBe(422);
    expect((await empty.json()).detail).toMatch(/no readable text/);

    const { source } = await (await upload("notes.md", "text")).json();
    const removed = await one.DELETE(request(`/api/knowledge/${source.id}`, { method: "DELETE" }), ctx(source.id));
    expect(removed.status).toBe(200);
    expect(core.addOns).toHaveLength(0);
    expect((await one.DELETE(request("/api/knowledge/not-an-id", { method: "DELETE" }), ctx("not-an-id"))).status).toBe(400);
  });

  it("reads a document's content with where each reference is named", async () => {
    const { source } = await (await upload("notes.md", "SQL injection, CWE-89, in search.")).json();
    const res = await content.GET(request(`/api/knowledge/${source.id}/passages?offset=0&limit=50`, { origin: null }), ctx(source.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    const [p] = body.passages;
    expect(p.text.slice(p.spans[0].start, p.spans[0].end)).toBe("CWE-89");
    expect(core.calls.find((c) => c.path.includes("/passages"))!.path).toBe(`/knowledge-add-ons/${source.id}/passages?offset=0&limit=50`);
    const bad = await content.GET(request("/api/knowledge/nope/passages", { origin: null }), ctx("nope"));
    expect(bad.status).toBe(400);
  });

  it("says what a reference is, from the built-in knowledge base, or null", async () => {
    const res = await about.GET(request("/api/knowledge/about?type=CWE&ref=CWE-89&label=CWE-89", { origin: null }));
    expect((await res.json()).about).toMatchObject({ title: "CWE-89: SQL Injection", source: "CWE", url: "https://cwe.mitre.org/data/definitions/89.html" });
    const search = core.calls.find((c) => c.path.startsWith("/knowledge/search"))!;
    expect(search.path).toContain("source=CWE");
    const none = await about.GET(request("/api/knowledge/about?type=CVE&ref=CVE-2099-0001&label=CVE-2099-0001", { origin: null }));
    expect((await none.json()).about).toBeNull();
    expect((await about.GET(request("/api/knowledge/about?type=BAD&ref=x", { origin: null }))).status).toBe(400);
  });

  it("starts the re-ingest on the Core API and reports it; a second start is 409", async () => {
    expect((await (await reingest.GET(request("/api/knowledge/reingest", { origin: null }))).json()).status).toBe("IDLE");
    const started = await reingest.POST(request("/api/knowledge/reingest", { method: "POST" }));
    expect(started.status).toBe(202);
    expect((await started.json()).status).toBe("RUNNING");
    const again = await reingest.POST(request("/api/knowledge/reingest", { method: "POST" }));
    expect(again.status).toBe(409);
    expect((await again.json()).detail).toMatch(/already/);
    expect((await reingest.POST(request("/api/knowledge/reingest", { method: "POST", origin: "http://evil.example" }))).status).toBe(403);
  });

  it("keeps the locks: no session 401, another origin 403", async () => {
    cookie = "";
    expect((await graph.GET(request("/api/knowledge/graph", { origin: null }))).status).toBe(401);
    cookie = sessionValue(TOKEN);
    const foreign = await list.POST(request("/api/knowledge", { method: "POST", body: new FormData(), origin: "http://evil.example" }));
    expect(foreign.status).toBe(403);
    expect(core.calls).toHaveLength(0);
  });
});
