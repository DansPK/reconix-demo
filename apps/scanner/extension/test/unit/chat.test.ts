// The scanner server answers plain questions from the scan's findings (no LLM), and turns commands into actions.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { makeTree, scan, startDemo } from "./helpers";

const FINDINGS = [
  { path: "src/utils/hash.js", title: "Weak password hash (MD5)", severity: "low" as const, rule_id: "a",
    cwe: "CWE-327", explanation: "MD5 is broken for passwords.", fix_recommendation: "Use bcrypt." },
  { path: "src/views/profile.js", title: "Reflected XSS", severity: "medium" as const, rule_id: "b",
    cwe: "CWE-79", explanation: "innerHTML renders untrusted input.", fix_recommendation: "Use textContent." },
];

let demo: Awaited<ReturnType<typeof startDemo>>;
let sessionId = "";
const ask = (text: string) => demo.backend.chat(sessionId, text);

before(async () => {
  demo = await startDemo({ findings: FINDINGS });
  sessionId = (await demo.backend.createSession()).id;
  const other = (await demo.backend.createSession()).id;
  assert.match((await demo.backend.chat(other, "what did you find?")).message.text, /haven't scanned/i);
  await scan(demo.backend, sessionId, await makeTree({ "src/utils/hash.js": "x", "src/views/profile.js": "y" }));
});
after(() => demo.stop());

test("a topic question explains that finding", async () => {
  const { message } = await ask("explain the xss");
  assert.match(message.text, /Reflected XSS/);
  assert.match(message.text, /CWE-79/);
});

test("the most serious problems come worst first, and 'fix it' means what was offered", async () => {
  const { message, actions } = await ask("what are the most serious problems?");
  assert.ok(message.text.indexOf("Reflected XSS") < message.text.indexOf("Weak password hash"), "medium before low");
  assert.deepEqual((await ask("fix them")).run, { kind: "fix", findingIds: actions[0].findingIds });
});

test("an unrecognised question suggests what to ask", async () => {
  const { message, run } = await ask("hello there");
  assert.equal(run, undefined);
  assert.match(message.text, /most serious problems/i);
});

test("scan wordings are commands", async () => {
  assert.deepEqual((await ask("scan")).run, { kind: "scan" });
  assert.deepEqual((await ask("scan this project")).run, { kind: "scan" });
  assert.deepEqual((await ask("scan everything again from scratch")).run, { kind: "scan", full: true });
  assert.deepEqual((await ask("scan only the src/auth folder")).run, { kind: "scan", paths: ["src/auth"] });
  assert.deepEqual((await ask("is my login code safe?")).run, { kind: "scan", confirm: true });
  assert.equal((await ask("stop")).run?.kind, "cancel");
  assert.equal((await ask("scan https://github.com/lumina-store/lumina-site")).run?.kind, "scanGithub");
  assert.equal((await ask("summarize all findings")).run?.kind, "summarize");
});

test("a model that is down is an error with its code", async () => {
  demo.fake.llmDown = true;
  await assert.rejects(ask("hello"), /^ToolCallError|MODEL_UNAVAILABLE/);
  demo.fake.llmDown = false;
});
