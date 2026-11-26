/* scripts/serve-helpers.mjs: the dashboard's launcher opens the browser only once the server
   really answered (Next.js says "Ready" before its config is loaded), and only through a private
   redirect file, so the sign-in token never shows in the process list. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openerFor, openPrivately, redirectFile, waitUntilAnswering } from "../scripts/serve-helpers.mjs";

let server: Server | null = null;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())).then(() => void (server = null)));

/** A local server answering with `statuses` in turn (the last one repeats). */
async function serve(statuses: number[]): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  server = createServer((_req, res) => res.writeHead(statuses[Math.min(hits++, statuses.length - 1)]).end());
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/login`, hits: () => hits };
}

const fast = { within: 3_000, tryMs: 500, pauseMs: 10 };

describe("waitUntilAnswering", () => {
  it("is true once the sign-in page answers, after failing tries", async () => {
    const s = await serve([500, 500, 200]);
    await expect(waitUntilAnswering(s.url, fast)).resolves.toBe(true);
    expect(s.hits()).toBe(3);
  });

  it("takes a redirect as an answer, without following it", async () => {
    const s = await serve([307]);
    await expect(waitUntilAnswering(s.url, fast)).resolves.toBe(true);
    expect(s.hits()).toBe(1);
  });

  it("is false when the server only fails (a broken config) or nothing listens", async () => {
    const s = await serve([500]);
    await expect(waitUntilAnswering(s.url, { ...fast, within: 200 })).resolves.toBe(false);
    await expect(waitUntilAnswering("http://127.0.0.1:9/login", { ...fast, within: 200 })).resolves.toBe(false);
  });

  it("is false as soon as the server stopped, even if something answers", async () => {
    const s = await serve([200]);
    await expect(waitUntilAnswering(s.url, { ...fast, stopped: () => true })).resolves.toBe(false);
    expect(s.hits()).toBe(0);
  });
});

describe("openPrivately", () => {
  const link = 'http://127.0.0.1:3100/login#token=abc"<x>';

  it("writes a private redirect file and opens that, never the link", () => {
    const seen: string[][] = [];
    const launch = (cmd: string, args: string[]) => {
      seen.push([cmd, ...args]);
      return { on: () => ({ unref: () => undefined }) };
    };
    const cleanup = openPrivately(link, { launch, lifetime: 60_000 });
    const [[, ...args]] = seen;
    const file = args[args.length - 1];
    expect(seen.flat().join(" ")).not.toContain("token");
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    }
    const html = readFileSync(file, "utf8");
    expect(html).toContain("url=http://127.0.0.1:3100/login#token=abc&quot;&lt;x&gt;"); // escaped
    expect(html).not.toContain('"<x>');
    cleanup();
    expect(existsSync(path.dirname(file))).toBe(false);
  });

  it("removes the file by itself after its lifetime", async () => {
    let file = "";
    const launch = (_cmd: string, args: string[]) => {
      file = args[args.length - 1];
      return { on: () => ({ unref: () => undefined }) };
    };
    openPrivately(link, { launch, lifetime: 20 });
    expect(existsSync(file)).toBe(true);
    await new Promise((done) => setTimeout(done, 80));
    expect(existsSync(path.dirname(file))).toBe(false);
  });

  it("escapes the link in its own file (redirectFile)", () => {
    const { file, cleanup } = redirectFile(link);
    expect(readFileSync(file, "utf8")).toContain('href="http://127.0.0.1:3100/login#token=abc&quot;&lt;x&gt;"');
    cleanup();
    expect(existsSync(file)).toBe(false);
  });

  it("uses the desktop's opener on the file", () => {
    expect(openerFor("/f.html", "linux")).toEqual(["xdg-open", ["/f.html"]]);
    expect(openerFor("/f.html", "darwin")).toEqual(["open", ["/f.html"]]);
    expect(openerFor("C:\\f.html", "win32")).toEqual(["cmd", ["/c", "start", "", "C:\\f.html"]]);
  });
});
