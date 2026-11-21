// The Core API id the e2e stand-in (e2e/core-api-stub.mjs) gives a saved sample run, so a spec
// can open that run's Findings (`?assessment=<id>`). Deterministic: a UUID-shaped SHA-1 of the uid.
import { createHash } from "node:crypto";

/** @param {string} uid */
export function apiId(uid) {
  const m = uid.match(/^\d{8}-\d{6}-([0-9a-f]{4})_/i);
  const h = createHash("sha1").update(`reconix-e2e:${uid}`).digest("hex");
  const prefix = m ? m[1].toLowerCase() + h.slice(4, 8) : h.slice(0, 8);
  return `${prefix}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
