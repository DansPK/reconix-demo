import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countBySeverity,
  diagnosticMessage,
  mergeFindings,
  prepareFindings,
  scanSummaryText,
  sortFindings,
  toFindingView,
  underPaths,
  visibleFindings,
} from "../../src/findingsLogic";
import type { Finding } from "../../src/shared/contract";
import { LUMINA } from "./helpers";

const fixtures: Finding[] = LUMINA;

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "f-1",
    scanId: "scan-1",
    code: "RCX-001",
    tools: ["SEMGREP"],
    findingStatus: "OPEN",
    ruleId: "rule.a",
    title: "Title",
    severity: "HIGH",
    verdict: "CONFIRMED",
    path: "src/app.js",
    line: 1,
    message: "msg",
    cwe: ["CWE-79"],
    ...overrides,
  };
}

test("visibleFindings hides likely false positives by core's rule, unless asked", () => {
  const fp = "LIKELY_FALSE_POSITIVE" as const;
  const items = [
    finding({ id: "real" }),
    finding({ id: "medium-fp", severity: "MEDIUM", verdict: fp }),
    // The AI alone can't hide these: text in the scanned code can sway it.
    finding({ id: "critical-fp", severity: "CRITICAL", verdict: fp }),
    finding({ id: "secret-fp", severity: "LOW", tools: ["GITLEAKS"], verdict: fp }),
    // A person's decision always hides.
    finding({ id: "person-fp", severity: "CRITICAL", verdict: fp, findingStatus: "FALSE_POSITIVE" }),
  ];
  assert.deepEqual(visibleFindings(items, false).map((f) => f.id), ["real", "critical-fp", "secret-fp"]);
  assert.equal(visibleFindings(items, true).length, 5);
});

test("sortFindings orders by severity, then path, then line, without mutating", () => {
  const items = [
    finding({ id: "none", severity: "NONE", path: "a.js", line: 1 }),
    finding({ id: "unknown", severity: "UNKNOWN", path: "a.js", line: 1 }),
    finding({ id: "low", severity: "LOW", path: "a.js", line: 1 }),
    finding({ id: "high-b", severity: "HIGH", path: "b.js", line: 1 }),
    finding({ id: "high-a-9", severity: "HIGH", path: "a.js", line: 9 }),
    finding({ id: "high-a-2", severity: "HIGH", path: "a.js", line: 2 }),
    finding({ id: "crit", severity: "CRITICAL", path: "z.js", line: 1 }),
  ];
  const before = items.map((f) => f.id);
  assert.deepEqual(sortFindings(items).map((f) => f.id), ["crit", "high-a-2", "high-a-9", "high-b", "low", "unknown", "none"]);
  assert.deepEqual(items.map((f) => f.id), before);
});

test("countBySeverity counts every severity, including zeros", () => {
  const items = [finding({ severity: "CRITICAL" }), finding({ severity: "HIGH" }), finding({ severity: "HIGH" })];
  assert.deepEqual(countBySeverity(items), { CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 });
});

test("mergeFindings merges hits on the same path, line and CWE set", () => {
  const merged = mergeFindings([
    finding({ id: "a", ruleId: "eval-detected", severity: "HIGH", cwe: ["CWE-95", "CWE-94"] }),
    finding({ id: "b", ruleId: "code-string-concat", severity: "CRITICAL", tools: ["OTHER", "SEMGREP"], cwe: ["CWE-94", "CWE-95"] }),
    finding({ id: "c", line: 2 }),
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "b", "the most severe hit is the representative");
  assert.equal(merged[0].severity, "CRITICAL");
  assert.deepEqual(merged[0].findingIds, ["b", "a"]);
  assert.deepEqual(merged[0].ruleIds, ["code-string-concat", "eval-detected"]);
  assert.deepEqual(merged[0].tools, ["OTHER", "SEMGREP"], "each tool once");
  assert.deepEqual(merged[1].findingIds, ["c"]);
});

test("mergeFindings keeps different CWEs on one line apart", () => {
  const merged = mergeFindings([finding({ id: "a", cwe: ["CWE-79"] }), finding({ id: "b", cwe: ["CWE-89"] })]);
  assert.equal(merged.length, 2);
});

test("Lumina plus a second hit merges 13 raw hits into 12 problems with matching counts", () => {
  const merged = mergeFindings(fixtures);
  assert.equal(fixtures.length, 13);
  assert.equal(merged.length, 12);
  assert.equal(merged.flatMap((f) => f.findingIds).length, fixtures.length, "every raw hit is kept once");
  const total = Object.values(countBySeverity(merged)).reduce((a, b) => a + b, 0);
  assert.equal(total, 12);
});

test("prepareFindings filters, merges, sorts and counts what the UI shows", () => {
  const hidden = prepareFindings(fixtures, false);
  assert.equal(hidden.findings.length, 11);
  assert.deepEqual(hidden.counts, { CRITICAL: 2, HIGH: 3, MEDIUM: 3, LOW: 3, UNKNOWN: 0, NONE: 0 });
  assert.equal(hidden.hiddenFalsePositives, 1);
  // Core's rule keeps the secret in sight even though the AI called it a false alarm.
  assert.deepEqual(hidden.findings.filter((f) => f.verdict === "LIKELY_FALSE_POSITIVE").map((f) => f.tools), [["GITLEAKS"]]);
  assert.deepEqual(hidden.findings, sortFindings(hidden.findings));

  const shown = prepareFindings(fixtures, true);
  assert.equal(shown.findings.length, 12);
  assert.equal(shown.hiddenFalsePositives, 0);
});

test("prepareFindings never lets a false-positive hit hide a real one on the same line", () => {
  // A CRITICAL false alarm stays in sight (core's rule) and merges with the real HIGH hit: the
  // merged finding is the real one, so Fix all and the summary still count it.
  const serious = prepareFindings([
    finding({ id: "fp", severity: "CRITICAL", verdict: "LIKELY_FALSE_POSITIVE" }),
    finding({ id: "real", severity: "HIGH", verdict: "LIKELY_TRUE_POSITIVE" }),
  ], false);
  assert.deepEqual(serious.findings.map((f) => [f.id, f.severity, f.verdict, f.findingIds]), [["real", "HIGH", "LIKELY_TRUE_POSITIVE", ["real", "fp"]]]);
  assert.equal(serious.hiddenFalsePositives, 0);
  // An unreviewed CRITICAL hit is not a false alarm: it keeps the group CRITICAL next to a confirmed LOW one.
  const unreviewed = prepareFindings([
    finding({ id: "low", severity: "LOW", verdict: "CONFIRMED" }),
    finding({ id: "crit", severity: "CRITICAL", verdict: "UNVERIFIED" }),
  ], false);
  assert.deepEqual(unreviewed.findings.map((f) => [f.id, f.severity]), [["crit", "CRITICAL"]]);
  // A MEDIUM false alarm is hidden before merging, as before.
  const medium = prepareFindings([
    finding({ id: "fp", severity: "MEDIUM", verdict: "LIKELY_FALSE_POSITIVE" }),
    finding({ id: "real", severity: "HIGH" }),
  ], false);
  assert.deepEqual(medium.findings.map((f) => f.findingIds), [["real"]]);
  assert.equal(medium.hiddenFalsePositives, 1);
});

test("toFindingView never carries the snippet to the webview", () => {
  const [merged] = mergeFindings([finding({ snippet: "API_KEY=sk-live-123" })]);
  const view = toFindingView(merged);
  assert.equal("snippet" in view, false);
  assert.ok(!JSON.stringify(view).includes("sk-live-123"));
});

test("toFindingView renders review text as Markdown and escapes raw HTML", () => {
  const [merged] = mergeFindings([
    finding({ explanation: "Uses `eval` <script>alert(1)</script>", fixRecommendation: "[click](javascript:alert(1))" }),
  ]);
  const view = toFindingView(merged, true);
  assert.match(view.explanationHtml ?? "", /<code>eval<\/code>/);
  assert.ok(!(view.explanationHtml ?? "").includes("<script>"), "raw HTML must be escaped");
  assert.ok(!/href="javascript:/i.test(view.fixRecommendationHtml ?? ""), "unsafe links must not become links");
  assert.equal(view.outdated, true);
  assert.equal(toFindingView(mergeFindings([finding({})])[0]).explanationHtml, undefined);
});

test("diagnosticMessage is the title plus the first sentence of the fix", () => {
  assert.equal(
    diagnosticMessage(finding({ title: "SQL injection", fixRecommendation: "Use bound parameters. Also add tests." })),
    "SQL injection: Use bound parameters.",
  );
  assert.equal(diagnosticMessage(finding({ title: "SQL injection" })), "SQL injection");
});

test("scanSummaryText reports counts and hidden false alarms like the reference", () => {
  assert.equal(
    scanSummaryText({ CRITICAL: 5, HIGH: 12, MEDIUM: 7, LOW: 2, UNKNOWN: 1, NONE: 0 }, 3),
    "Scan finished: 27 findings (5 critical, 12 high, 7 medium, 2 low, 1 unknown). 3 of them look like false alarms, so they are hidden in the Findings tab.",
  );
  assert.equal(scanSummaryText({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 }, 0), "Scan finished: no findings.");
  assert.equal(
    scanSummaryText({ CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 2 }, 0),
    "Scan finished: 3 findings (1 high, 2 informational).",
  );
  assert.equal(
    scanSummaryText({ CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 0, UNKNOWN: 0, NONE: 0 }, 1),
    "Scan finished: 1 finding (1 medium). It looks like a false alarm, so it is hidden in the Findings tab.",
  );
  assert.match(scanSummaryText({ CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0, NONE: 0 }, 0, "gitleaks failed"), /Some steps had problems: gitleaks failed$/);
});

test("a merged finding needs a manual fix only when every hit does", () => {
  const allManual = mergeFindings([
    finding({ id: "a", manualFix: "upgrade the package" }),
    finding({ id: "b", ruleId: "rule.b", manualFix: "upgrade the package" }),
  ]);
  assert.equal(allManual[0].manualFix, "upgrade the package");
  const oneFixable = mergeFindings([finding({ id: "a", manualFix: "upgrade the package" }), finding({ id: "b", ruleId: "rule.b" })]);
  assert.equal(oneFixable.length, 1);
  assert.equal(oneFixable[0].manualFix, undefined);
  assert.equal(toFindingView(allManual[0]).manualFix, "upgrade the package");
});

test("underPaths matches a path itself or anything inside it, never a mere prefix", () => {
  assert.equal(underPaths("src/app.js", ["src/app.js"]), true);
  assert.equal(underPaths("src/routes/users.js", ["src"]), true);
  assert.equal(underPaths("src/routes/users.js", ["src/"]), true);
  assert.equal(underPaths("srcx/app.js", ["src"]), false);
  assert.equal(underPaths("lib/app.js", ["src", "test"]), false);
});
