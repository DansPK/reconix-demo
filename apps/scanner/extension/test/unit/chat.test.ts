// The demo server answers plain questions from the scan's static findings (no LLM).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { HarnessClient } from "../../src/client";
import { prepareWorkspace, watchToEnd } from "../../src/scanFlow";
import { FakeHarness } from "../../server/server";
import { makeTree } from "./helpers";

const settings = { maxFileSizeKB: 2048, maxUploadMB: 200, extraExcludes: [] };

// Two findings with the shape the answers key off (severity + cwe).
const FINDINGS = [
  { path: "src/utils/hash.js", title: "Weak password hash (MD5)", severity: "low" as const,
    cwe: "CWE-327", explanation: "MD5 is broken for passwords.", fix_recommendation: "Use bcrypt." },
  { path: "src/views/profile.js", title: "Reflected XSS", severity: "medium" as const,
    cwe: "CWE-79", explanation: "innerHTML renders untrusted input.", fix_recommendation: "Use textContent." },
];

let fake: FakeHarness;
before(async () => {
  fake = new FakeHarness({ stepMs: 10, findings: FINDINGS });
  await fake.start();
});
after(() => fake.stop());

async function scannedSession() {
  const root = await makeTree({ "src/utils/hash.js": "x", "src/views/profile.js": "y" });
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  const prep = await prepareWorkspace(c, session_id, root, settings);
  const { scan_id } = await c.startScan(session_id, { upload_id: prep.uploadId, deleted_paths: prep.deleted });
  await watchToEnd(c, scan_id, () => {});
  return { c, session_id };
}

test("before any scan, a question says to scan first", async () => {
  const c = new HarnessClient(fake.url, fake.token);
  const { session_id } = await c.createSession("workspace");
  const { reply } = await c.chat(session_id, "what did you find?");
  assert.match(reply, /haven't scanned/i);
  await c.close();
});

test("a topic question explains that finding", async () => {
  const { c, session_id } = await scannedSession();
  const { reply } = await c.chat(session_id, "explain the xss");
  assert.match(reply, /Reflected XSS/);
  assert.match(reply, /CWE-79/);
  await c.close();
});

test("'what did you find' lists every finding, most severe first", async () => {
  const { c, session_id } = await scannedSession();
  const { reply } = await c.chat(session_id, "what did you find?");
  assert.match(reply, /2 issues/);
  assert.ok(reply.indexOf("Reflected XSS") < reply.indexOf("Weak password hash"), "medium before low");
  await c.close();
});

test("an unrecognised question suggests what to ask, not an echo", async () => {
  const { c, session_id } = await scannedSession();
  const { reply } = await c.chat(session_id, "hello there");
  assert.doesNotMatch(reply, /You said/);
  assert.match(reply, /what did you find/i);
  await c.close();
});
