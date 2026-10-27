/* The data loader's and the docs' own session check (behind the proxy). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionValue } from "@/lib/auth/session";

const TOKEN = "guard-token-0123456789abcdef";
let cookie: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie === undefined ? undefined : { value: cookie }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { requireSignedIn, signedIn } = await import("@/lib/auth/guard");

beforeEach(() => {
  process.env.RECONIX_WEB_TOKEN = TOKEN;
});
afterEach(() => {
  delete process.env.RECONIX_WEB_TOKEN;
  cookie = undefined;
});

describe("requireSignedIn", () => {
  it("lets a session through", async () => {
    cookie = sessionValue(TOKEN);
    expect(await signedIn()).toBe(true);
    await expect(requireSignedIn()).resolves.toBeUndefined();
  });

  it.each([undefined, "1.forged", "viewer.1.forged"])("sends %s to sign-in", async (value) => {
    cookie = value;
    expect(await signedIn()).toBe(false);
    await expect(requireSignedIn()).rejects.toThrow("redirect:/login");
  });

  it("sends an old role-prefixed cookie to sign-in", async () => {
    cookie = `operator.${sessionValue(TOKEN)}`;
    await expect(requireSignedIn()).rejects.toThrow("redirect:/login");
  });

  it("refuses everyone when the dashboard has no launch token", async () => {
    cookie = sessionValue(TOKEN);
    delete process.env.RECONIX_WEB_TOKEN;
    await expect(requireSignedIn()).rejects.toThrow("redirect:/login");
  });
});
