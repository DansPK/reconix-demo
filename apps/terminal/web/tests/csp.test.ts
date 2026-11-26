/* The Content-Security-Policy: nonce'd scripts, and nothing framed — no page and no route, the
   exports included (they are downloads; the combined preview is a sandboxed srcDoc frame). */
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy } from "@/lib/auth/csp";

const directives = (policy: string) => Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0], d]));

describe("contentSecurityPolicy", () => {
  it("carries the script nonce and forbids framing by default", () => {
    const d = directives(contentSecurityPolicy("n0nce"));
    expect(d["script-src"]).toContain("'nonce-n0nce'");
    expect(d["script-src"]).toContain("'strict-dynamic'");
    expect(d["frame-ancestors"]).toBe("frame-ancestors 'none'");
    expect(d["object-src"]).toBe("object-src 'none'");
    expect(d["frame-src"]).toBe("frame-src 'self'");
  });

  it("is the same policy for every route, the export routes included: none may be framed", () => {
    expect(contentSecurityPolicy("n")).toMatch(/frame-ancestors 'none'$/);
    expect(contentSecurityPolicy("n")).not.toContain("frame-ancestors 'self'");
  });

  it("lets pages connect to this server only (no terminal helper any more)", () => {
    expect(directives(contentSecurityPolicy("n"))["connect-src"]).not.toContain("127.0.0.1");
  });
});
