import type { NextConfig } from "next";

import { ALL_DOCS_REDIRECTS } from "./src/lib/docs-redirects";
import { MAX_BODY_BYTES } from "./src/lib/knowledge/rules";

/* The dashboard is local and read-only, but it shows security findings, so it ships the
   usual hardening headers. The Content-Security-Policy (with a per-request script nonce)
   is set in src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  experimental: {
    /* src/proxy.ts runs before every route, so Next.js keeps a copy of each request body for it,
       cut silently past this size (10 MB by default). The Security knowledge upload takes up to
       MAX_BODY_BYTES and counts the body itself (413 past it): keep the copy a whole megabyte
       longer, so a body that is too big always reaches that count rather than arriving cut. */
    proxyClientMaxBodySize: MAX_BODY_BYTES + 1024 * 1024,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  /* The documentation's old addresses (src/lib/docs-redirects.ts: the v2 pages, then every
     page's own address → its anchor on its group's page): permanent, so the browser and search
     engines learn the new address. The specific rules come first (the first match wins). */
  async redirects() {
    return ALL_DOCS_REDIRECTS.map((r) => ({ ...r, permanent: true }));
  },
};

export default nextConfig;
