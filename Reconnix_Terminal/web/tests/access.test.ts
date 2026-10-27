/* No roles: the proxy. Signed out (or with an old role-prefixed cookie), pages go to /login and
   routes answer 401; signed in, every page and route is passed on — the AI Assistant's and
   Security knowledge's too. (There is no Terminal any more: e2e/access.spec.ts checks that
   /terminal and /api/terminal/ticket answer 404.) */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";

const TOKEN = "access-test-token-0123456789";
const ORIGIN = "http://127.0.0.1:3100";

const { proxy } = await import("@/proxy");

const KEYS = ["RECONIX_WEB_TOKEN"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.RECONIX_WEB_TOKEN = TOKEN;
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const through = (path: string, session: string | null, method = "GET") =>
  proxy(new NextRequest(`${ORIGIN}${path}`, { method, headers: { host: "127.0.0.1:3100", ...(session !== null ? { cookie: `${COOKIE}=${session}` } : {}) } }));

const PAGES = ["/", "/?view=assistant", "/?view=knowledge", "/docs", "/assistant"];
const ROUTES: [string, string][] = [
  ["/api/assistant", "POST"],
  ["/api/assistant/conversations", "GET"],
  ["/api/assistant/models", "GET"],
  ["/api/knowledge", "GET"],
  ["/api/knowledge", "POST"],
  ["/api/reports/combined", "GET"],
];

describe("the proxy", () => {
  it.each(PAGES)("sends a signed-out visitor of %s to sign-in", async (path) => {
    const res = await through(path, null);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it.each(ROUTES)("answers 401 on %s %s without a session", async (path, method) => {
    const res = await through(path, null, method);
    expect(res.status).toBe(401);
    expect((await res.json()).detail).toBe("Sign in first.");
  });

  it("no longer takes an old role-prefixed cookie: its owner signs in again", async () => {
    const old = `operator.${sessionValue(TOKEN)}`;
    expect((await through("/api/assistant/models", old)).status).toBe(401);
    expect(new URL((await through("/", old)).headers.get("location") ?? "").pathname).toBe("/login");
  });

  it.each([...PAGES.map((p): [string, string] => [p, "GET"]), ...ROUTES])("passes a session on to %s %s", async (path, method) => {
    const res = await through(path, sessionValue(TOKEN), method);
    expect(res.status).toBe(200); // NextResponse.next(): the page or handler answers
    expect(res.headers.get("location")).toBeNull();
  });

  it("still answers only on 127.0.0.1", async () => {
    const res = await proxy(new NextRequest("http://evil.example/", { headers: { host: "evil.example", cookie: `${COOKIE}=${sessionValue(TOKEN)}` } }));
    expect(res.status).toBe(403);
  });
});
