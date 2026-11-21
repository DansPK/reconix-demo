/* The launch token, the signed session cookie (no roles) and the Host allowlist. */
import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { isSameOrigin } from "@/lib/auth/origin";
import { allowedHosts, launchToken, readSession, sessionValue, tokenMatches } from "@/lib/auth/session";

const TOKEN = "unit-token-0123456789abcdef";
const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
});

/** A cookie as the dashboard signed it while it had roles: "<role>.<issued>.<signature>". */
function oldRoleCookie(role: "viewer" | "operator", now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  return `${role}.${issued}.${createHmac("sha256", TOKEN).update(`reconix-web:${role}:${issued}`).digest("base64url")}`;
}

describe("session cookie", () => {
  it("round-trips, naming no role", () => {
    const value = sessionValue(TOKEN);
    expect(value).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(readSession(value, TOKEN)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "123",
    "123.",
    "123.forged",
    "abc.whatever",
    `.${sessionValue(TOKEN).split(".")[1]}`,
    `${sessionValue(TOKEN)}.extra`,
    `viewer.${sessionValue(TOKEN)}`,
    `operator.${sessionValue(TOKEN)}`,
  ])("refuses %s", (value) => {
    expect(readSession(value, TOKEN)).toBe(false);
  });

  it("no longer reads an old role-prefixed cookie, however genuine: its owner signs in again", () => {
    expect(readSession(oldRoleCookie("viewer"), TOKEN)).toBe(false);
    expect(readSession(oldRoleCookie("operator"), TOKEN)).toBe(false);
    const [, issued, signature] = oldRoleCookie("operator").split(".");
    expect(readSession(`${issued}.${signature}`, TOKEN)).toBe(false); // nor without its prefix
  });

  it("expires on the server after 12 hours, whatever the browser keeps", () => {
    const issued = Date.parse("2026-10-05T08:00:00Z");
    const value = sessionValue(TOKEN, issued);
    expect(readSession(value, TOKEN, issued + 11 * 3_600_000)).toBe(true);
    expect(readSession(value, TOKEN, issued + 13 * 3_600_000)).toBe(false);
  });

  it("allows a minute of clock skew, not more", () => {
    const issued = Date.parse("2026-10-05T08:00:00Z");
    const value = sessionValue(TOKEN, issued);
    expect(readSession(value, TOKEN, issued - 30_000)).toBe(true);
    expect(readSession(value, TOKEN, issued - 120_000)).toBe(false);
  });

  it("can't be re-dated without the token", () => {
    const [, signature] = sessionValue(TOKEN, Date.parse("2026-10-01T00:00:00Z")).split(".");
    const later = Math.floor(Date.now() / 1000);
    expect(readSession(`${later}.${signature}`, TOKEN)).toBe(false);
  });

  it("stops working when the dashboard restarts with a new token", () => {
    expect(readSession(sessionValue(TOKEN), "another-token-0123456789")).toBe(false);
  });
});

describe("same-origin requests", () => {
  const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:3100/api/x", { method: "POST", headers });

  it("need an Origin that matches the Host", () => {
    expect(isSameOrigin(request({ origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "http://evil.example.com", host: "127.0.0.1:3100" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "http://127.0.0.1:3101", host: "127.0.0.1:3100" }))).toBe(false);
    expect(isSameOrigin(request({ host: "127.0.0.1:3100" }))).toBe(false);
  });
});

describe("launch token", () => {
  it("must be set and long enough", () => {
    delete process.env.RECONIX_WEB_TOKEN;
    expect(launchToken()).toBeNull();
    process.env.RECONIX_WEB_TOKEN = "short";
    expect(launchToken()).toBeNull();
    process.env.RECONIX_WEB_TOKEN = TOKEN;
    expect(launchToken()).toBe(TOKEN);
  });

  it("compares exactly", () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches("", TOKEN)).toBe(false);
  });
});

describe("hosts", () => {
  it("only answers on loopback names with the configured port", () => {
    process.env.RECONIX_WEB_PORT = "4321";
    expect(allowedHosts()).toEqual(["127.0.0.1:4321", "localhost:4321"]);
  });
});
