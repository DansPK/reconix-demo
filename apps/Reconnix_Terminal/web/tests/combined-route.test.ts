/* GET /api/reports/combined called directly (the e2e tests go through the proxy too): a
   session, the query checked before anything is read (1–5 distinct uids, the format, the
   flags), 404 for a run that is not saved, the preview HTML inline, the PDF and the DOCX as
   downloads, 501 with the DOCX link when no browser can print. Every answer is no-store. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";
import { COMBINE_MAX, combinedFileName, combinedHref } from "@/lib/report/combined/options";
import { parseCombinedQuery } from "@/lib/report/combined/query";
import { chromeBinary } from "@/lib/report/pdf";

import { sampleNames } from "./fixtures";
import { unzip } from "./unzip";

const TOKEN = "route-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));
vi.mock("next/server", async (load) => ({ ...(await load<typeof import("next/server")>()), connection: async () => undefined }));

const { GET } = await import("@/app/api/reports/combined/route");

const uids = sampleNames().map((n) => n.replace(/\.json$/, ""));
const saved = { ...process.env };
beforeEach(() => {
  process.env.RECONIX_WEB_TOKEN = TOKEN;
  process.env.RECONIX_DATA_DIR = "sample-data";
  process.env.RECONIX_STALE_AFTER_HOURS = "0";
  delete process.env.RECONIX_CHROME;
  cookie = sessionValue(TOKEN);
});
afterEach(() => {
  process.env = { ...saved };
});

const get = (query: string) => GET(new Request(`http://127.0.0.1:3100/api/reports/combined?${query}`, { headers: { host: "127.0.0.1:3100" } }));
const detail = async (res: Response) => ((await res.json()) as { detail: string }).detail;

describe("the query", () => {
  it("accepts 1 to 5 distinct uids, a format and flags", () => {
    const ok = parseCombinedQuery(new URLSearchParams({ uids: uids.slice(0, 2).join(","), format: "pdf", evidence: "1", low: "true" }));
    expect(ok).toEqual({ ok: true, query: { uids: uids.slice(0, 2), format: "pdf", options: { evidence: true, low: true, appendix: false } } });
    expect(parseCombinedQuery(new URLSearchParams({ uids: uids[0] }))).toMatchObject({ ok: true, query: { format: "preview" } });
    expect(parseCombinedQuery(new URLSearchParams({ uids: uids[0], format: "docx" }))).toMatchObject({ ok: true, query: { format: "docx" } });
    expect(parseCombinedQuery(new URLSearchParams({ uids: uids.slice(0, 5).join(",") }))).toMatchObject({ ok: true });
  });

  it.each([
    ["", "pick at least one run"],
    [[1, 2, 3, 4, 5, 6].map((i) => `2026100${i}-000000-0000_RCX-${i}`).join(","), `at most ${COMBINE_MAX} runs`],
    [`${uids[0]},${uids[0]}`, "listed twice"],
    ["../../etc/passwd", "not an assessment id"],
    [`${uids[0]},<script>`, "not an assessment id"],
  ])("refuses uids=%s", (value, why) => {
    const out = parseCombinedQuery(new URLSearchParams({ uids: value }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain(why);
  });

  it("refuses an unknown format or flag value", () => {
    for (const gone of ["html", "csv", "sarif", "json"]) expect(parseCombinedQuery(new URLSearchParams({ uids: uids[0], format: gone })).ok).toBe(false);
    expect(parseCombinedQuery(new URLSearchParams({ uids: uids[0], evidence: "yes" })).ok).toBe(false);
  });

  it("builds the route's link and an ASCII file name", () => {
    expect(combinedHref(["u1", "u2"], "preview", { evidence: true, low: false, appendix: true })).toBe("/api/reports/combined?uids=u1%2Cu2&format=preview&evidence=1&appendix=1");
    expect(combinedFileName(3, "pdf", new Date("2026-10-20T23:59:00Z"))).toBe("combined-3-runs-2026-10-20.pdf");
    expect(combinedFileName(3, "docx", new Date("2026-10-20T23:59:00Z"))).toBe("combined-3-runs-2026-10-20.docx");
  });
});

describe("GET /api/reports/combined", () => {
  it("needs a session (an old role-prefixed cookie is none)", async () => {
    cookie = "";
    const res = await get(`uids=${uids[0]}`);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    cookie = "viewer.forged";
    expect((await get(`uids=${uids[0]}`)).status).toBe(401);
    cookie = `viewer.${sessionValue(TOKEN)}`;
    expect((await get(`uids=${uids[0]}`)).status).toBe(401);
  });

  it("checks the request before reading any data", async () => {
    expect((await get(`uids=${["x1", "x2", "x3", "x4", "x5", "x6"].map((x) => `20261001-000000-0000_${x}`).join(",")}`)).status).toBe(400);
    expect((await get("uids=../etc")).status).toBe(400);
    expect((await get(`uids=${uids[0]}&format=exe`)).status).toBe(400);
    expect((await get(`uids=${uids[0]}&low=maybe`)).status).toBe(400);
    const res = await get("uids=");
    expect(await detail(res)).toContain("Bad request");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is a 404 when a run is not saved", async () => {
    const res = await get(`uids=${uids[0]},20200101-000000-dead_RCX-NOPE-1`);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await detail(res)).toContain("20200101-000000-dead_RCX-NOPE-1");
  });

  it("serves the preview's HTML inline (never as a file), never cached, with every run in it", async () => {
    const res = await get(`uids=${uids[0]},${uids[1]}&format=preview&evidence=1&low=1&appendix=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toBe("inline");
    const html = await res.text();
    expect(html).toContain(uids[0]);
    expect(html).toContain(uids[1]);
    expect(html).toContain("Combined security assessment report");
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`);
    expect(html).not.toContain("<script");
  });

  it("serves the Word document as a download, with every run in it", async () => {
    const res = await get(`uids=${uids[0]},${uids[1]}&format=docx&evidence=1&low=1&appendix=1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="combined-2-runs-\d{4}-\d{2}-\d{2}\.docx"$/);
    const doc = unzip(new Uint8Array(await res.arrayBuffer())).get("word/document.xml") ?? "";
    expect(doc).toContain(uids[0]);
    expect(doc).toContain(uids[1]);
    expect(doc).toContain("Combined findings summary");
    expect(doc).toContain("Appendix &amp; references");
  });

  it("answers 501 with the DOCX link when no browser can print the PDF", async () => {
    process.env.RECONIX_CHROME = "/nonexistent/chrome";
    const res = await get(`uids=${uids[0]},${uids[1]}&format=pdf&low=1`);
    expect(res.status).toBe(501);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { detail: string; docx: string; html?: string };
    expect(body.detail).toContain("RECONIX_CHROME");
    expect(body.detail).not.toContain("HTML");
    expect(body.docx).toBe(combinedHref([uids[0], uids[1]], "docx", { evidence: false, low: true, appendix: false }));
    expect(body.html).toBeUndefined();
  });

  // a printer is not part of every machine's contract; the e2e spec downloads a real one too
  it.skipIf(!chromeBinary())("prints one PDF as a download when a browser is there", { timeout: 90_000 }, async () => {
    const res = await get(`uids=${uids[0]},${uids[1]}&format=pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="combined-2-runs-\d{4}-\d{2}-\d{2}\.pdf"$/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
  });
});
