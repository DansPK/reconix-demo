import assert from "node:assert/strict";
import { test } from "node:test";
import { cardMarkdown, staticAnswer, staticSummary } from "../../src/backend/staticChat";
import type { Finding } from "../../src/shared/contract";
import { LUMINA } from "./helpers";

const raw: Finding[] = LUMINA;
const ids = new Set(raw.map((f) => f.id));

function fixIds(answer: ReturnType<typeof staticAnswer>): string[] {
  return answer.actions.flatMap((a) => (a.kind === "fixFindings" ? a.findingIds ?? [] : []));
}

test("before any scan it offers to scan", () => {
  const answer = staticAnswer("what are the most serious problems?", undefined);
  assert.match(answer.text, /haven't scanned/);
  assert.deepEqual(answer.actions.map((a) => a.kind), ["scanWorkspace"]);
});

test("explains a finding named by id, with its fix and a Fix button", () => {
  const answer = staticAnswer("Explain finding f-000000 and how to fix it.", raw);
  assert.match(answer.text, /SQL injection in catalog search/);
  assert.match(answer.text, /server\/index\.js:42/);
  assert.match(answer.text, /How to fix/);
  assert.deepEqual(fixIds(answer), ["f-000000"]);
});

test("lists the most serious problems worst first, offering to fix them", () => {
  const answer = staticAnswer("What are the most serious problems?", raw);
  assert.match(answer.text, /most serious/);
  assert.match(answer.text, /\(critical\)/);
  const offered = fixIds(answer);
  assert.equal(offered.length, 5);
  assert.ok(offered.every((id) => ids.has(id)));
  assert.equal(raw.find((f) => f.id === offered[0])!.severity, "CRITICAL");
});

test("answers about one file, a severity, a topic and the false alarms", () => {
  assert.match(staticAnswer("what's wrong in session.js?", raw).text, /server\/session\.js/);
  const high = staticAnswer("show me the high ones", raw);
  assert.ok(fixIds(high).every((id) => raw.find((f) => f.id === id)!.severity === "HIGH"));
  assert.match(staticAnswer("is there any sql injection?", raw).text, /SQL injection in catalog search/);
  const falseAlarms = staticAnswer("which findings are false alarms?", raw);
  assert.match(falseAlarms.text, /documentation value|input is bounded/);
  assert.deepEqual(falseAlarms.actions, []);
});

test("gives counts, help, and a pointer for anything else", () => {
  assert.match(staticAnswer("how many findings are there?", raw).text, /The last scan found \d+ problems: \d+ critical/);
  assert.match(staticAnswer("help", raw).text, /\*\*scan\*\* the project/);
  assert.match(staticAnswer("hello there", raw).text, /I answer from the last scan/);
});

test("the summary card counts every merged finding and links three things to fix first", () => {
  const { card, text } = staticSummary(raw);
  // Static mode fills every optional part of the card (core leaves some out).
  assert.ok(card.likelyReal !== undefined && card.falseAlarms !== undefined);
  assert.equal(card.total, card.likelyReal + card.falseAlarms + 0 /* UNVERIFIED would sit outside both */);
  assert.ok(card.falseAlarms > 0);
  assert.equal(card.fixFirst.length, 3);
  assert.ok(card.fixFirst.every((x) => x.findingIds.length === 1 && ids.has(x.findingIds[0])));
  assert.ok(card.fixFirst.every((x) => x.text !== undefined && !/f-[0-9a-f]{6,}/.test(x.text)), "ids are links, not text");
  assert.ok(card.files.length <= 3 && card.files.every((f, i, all) => i === 0 || all[i - 1].count >= f.count));
  assert.match(card.overall ?? "", /critical or high problems need attention/);
  assert.match(text, /^\*\*\d+ findings\*\*/);
  assert.match(text, /Fix first:/);
});

test("fix-first prefers findings that have a static fix among equally severe ones", () => {
  const fixable = new Set(["server/routes/exec.js"]);
  const { card } = staticSummary(raw, (f) => fixable.has(f.path));
  const first = raw.find((f) => f.id === card.fixFirst[0].findingIds[0])!;
  assert.ok(fixable.has(first.path), `${first.path} should come first`);
  assert.equal(first.severity, "CRITICAL");
});

test("an empty scan summarizes as no findings, with nothing to fix", () => {
  const { card, text } = staticSummary([]);
  assert.equal(card.total, 0);
  assert.deepEqual(card.fixFirst, []);
  assert.equal(card.overall, undefined);
  assert.equal(text, "**No findings.**");
  assert.equal(cardMarkdown({ ...card }), "**No findings.**");
});

test("a finding that needs a manual fix is explained with why, and offered no Fix", () => {
  const withManual = raw.map((f) => (f.tools.includes("GITLEAKS") ? { ...f, manualFix: "This needs a package upgrade." } : f));
  const dep = withManual.find((f) => f.tools.includes("GITLEAKS"))!;
  const explained = staticAnswer(`explain ${dep.id}`, withManual);
  assert.match(explained.text, /Needs a manual fix:\*\* This needs a package upgrade/);
  assert.deepEqual(explained.actions, []);
  const serious = staticAnswer("what are the most serious problems?", withManual);
  assert.match(serious.text, /manual fix/);
  assert.ok(fixIds(serious).every((id) => !withManual.find((f) => f.id === id)!.tools.includes("GITLEAKS")));
});

test("false alarms mean every likely false positive; only some are hidden, and chat and card agree", () => {
  const answer = staticAnswer("which ones are false alarms?", raw);
  assert.match(answer.text, /^2 findings look like a false alarm\. 1 of them is hidden in the Findings tab; a serious problem or a secret stays in sight/);
  const counts = staticAnswer("how many findings?", raw);
  assert.match(counts.text, /, plus 2 likely false alarms\./);
  assert.equal(staticSummary(raw).card.falseAlarms, 2);
});

test("problem answers list real problems only, and never offer to fix a likely false alarm", () => {
  const low = staticAnswer("what are the low findings?", raw);
  assert.match(low.text, /^2 low findings:/);
  assert.ok(!low.text.includes("sample-keys"), "the false-alarm secret is not in a problems list");
  const config = staticAnswer("what's wrong in src/data/sample-keys.js?", raw);
  assert.match(config.text, /no real problems in `src\/data\/sample-keys\.js`/);
});
