/* GET /api/assessments/<uid>/export called directly: a session, a known format (pdf, json,
   docx: nothing else), 404 for a run that is not saved, every format as a download (an `inline=1`
   changes nothing), 501 with the DOCX link when no browser can print, and 413 with
   DOCX_TOO_LARGE when the Word document would pass DOCX_MAX_MIB — here and on the combined
   route. Every answer is no-store. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";
import { DOCX_MAX_BYTES } from "@/lib/report/docx/ooxml";
import { DOCX_TOO_LARGE, downloadHref, NO_PRINTER } from "@/lib/report/formats";

import { SAMPLE_DIR, sampleAssessments, sampleNames } from "./fixtures";
import { unzip } from "./unzip";

const TOKEN = "route-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));
vi.mock("next/server", async (load) => ({ ...(await load<typeof import("next/server")>()), connection: async () => undefined }));

const { GET } = await import("@/app/api/assessments/[uid]/export/route");
const combined = (await import("@/app/api/reports/combined/route")).GET;

const withFindings = sampleAssessments().find((a) => a.findings.length > 0)!;
const uid = withFindings.uid;

// a saved run under the 5 MB file limit whose Word document passes the cap: 20,000-character
// evidence lines (the schema's longest string) of `&`, five bytes of XML each
const HUGE_DIR = mkdtempSync(path.join(tmpdir(), "reconix-export-route-"));
{
  const name = sampleNames().find((n) => n.startsWith(uid))!;
  const saved = JSON.parse(readFileSync(path.join(SAMPLE_DIR, name), "utf8"));
  saved.findings[0].evidence = Array.from({ length: Math.ceil(DOCX_MAX_BYTES / 100_000) + 1 }, () => "&".repeat(20_000));
  const text = JSON.stringify(saved);
  if (Buffer.byteLength(text) >= 5_000_000) throw new Error("the oversized run must still be a readable saved file");
  writeFileSync(path.join(HUGE_DIR, name), text);
}
afterAll(() => rmSync(HUGE_DIR, { recursive: true, force: true }));

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

const get = (id: string, query: string) =>
  GET(new Request(`http://127.0.0.1:3100/api/assessments/${encodeURIComponent(id)}/export?${query}`, { headers: { host: "127.0.0.1:3100" } }), {
    params: Promise.resolve({ uid: id }),
  });
const detail = async (res: Response) => ((await res.json()) as { detail: string }).detail;

describe("GET /api/assessments/<uid>/export", () => {
  it("needs a session", async () => {
    cookie = "";
    const res = await get(uid, "format=json");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("knows only pdf, json and docx", async () => {
    for (const gone of ["html", "csv", "sarif", "markdown", "PDF", ""]) {
      const res = await get(uid, `format=${gone}`);
      expect(res.status, gone).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("is a 404 for a run that is not saved", async () => {
    expect((await get("20200101-000000-dead_RCX-NOPE-1", "format=json")).status).toBe(404);
  });

  it("serves the JSON and the Word document as downloads, never inline", async () => {
    for (const query of ["format=json", "format=docx", "format=docx&inline=1"]) {
      const res = await get(uid, query);
      expect(res.status, query).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-disposition"), query).toMatch(/^attachment; filename="[A-Za-z0-9_-]+\.(json|docx)"$/);
    }
    const docx = await get(uid, "format=docx");
    expect(unzip(new Uint8Array(await docx.arrayBuffer())).get("word/document.xml")).toContain("Security Assessment Report");
  });

  it("answers 501 with the DOCX link when no browser can print the PDF (also with inline=1)", async () => {
    process.env.RECONIX_CHROME = "/nonexistent/chrome";
    const res = await get(uid, "format=pdf&inline=1");
    expect(res.status).toBe(501);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ detail: NO_PRINTER, docx: downloadHref(uid, "docx") });
  });

  it("answers 413 with DOCX_TOO_LARGE when the Word document would pass the cap", { timeout: 60_000 }, async () => {
    process.env.RECONIX_DATA_DIR = HUGE_DIR;
    const res = await get(uid, "format=docx");
    expect(res.status).toBe(413);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await detail(res)).toBe(DOCX_TOO_LARGE);
    expect((await get(uid, "format=json")).status).toBe(200); // the JSON of the same run is fine
  });
});

describe("GET /api/reports/combined, format=docx", () => {
  const getCombined = (query: string) => combined(new Request(`http://127.0.0.1:3100/api/reports/combined?${query}`, { headers: { host: "127.0.0.1:3100" } }));

  it("answers 413 with DOCX_TOO_LARGE past the cap, and builds it without the evidence", { timeout: 60_000 }, async () => {
    process.env.RECONIX_DATA_DIR = HUGE_DIR;
    const res = await getCombined(`uids=${uid}&format=docx&evidence=1&low=1`);
    expect(res.status).toBe(413);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await detail(res)).toBe(DOCX_TOO_LARGE);
    expect((await getCombined(`uids=${uid}&format=docx&low=1`)).status).toBe(200);
  });
});
