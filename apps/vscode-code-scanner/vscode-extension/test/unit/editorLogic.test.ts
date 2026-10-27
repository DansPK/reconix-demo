import assert from "node:assert/strict";
import { test } from "node:test";
import { badge, countBySeverity, cweUrl, findingsInLines, hoverMarkdown, lensGroups, statusBar, stepFinding, treeGroups,
  worstSeverity } from "../../src/editorLogic";

const f = (o: any) => ({ id: "x", tools: ["semgrep"], rule_id: "r", title: "T", severity: "low", cwe: null, path: "a",
  start_line: 1, end_line: 1, start_col: null, end_col: null, file_sha256: "", message: "", snippet: "",
  verdict: "likely_real", explanation: "", fix_recommendation: "", suggested_patch: null, status: "new",
  web_url: null, ...o });

test("counts and worst severity", () => {
  const list = [f({ severity: "low" }), f({ severity: "high" }), f({ severity: "high" })];
  assert.deepEqual(countBySeverity(list), { low: 1, high: 2 });
  assert.equal(worstSeverity(list), "high");
  assert.equal(worstSeverity([]), null);
});

test("status bar text", () => {
  assert.match(statusBar({ connected: false, scanning: false, percent: 0, counts: {} }).text, /disconnect/);
  assert.equal(statusBar({ connected: true, scanning: true, percent: 44.6, counts: {} }).text, "$(sync~spin) Reconix 45%");
  assert.equal(statusBar({ connected: true, scanning: false, percent: 0, counts: {} }).tooltip, "Reconix: no findings");
  const s = statusBar({ connected: true, scanning: false, percent: 0, counts: { critical: 1, high: 2, low: 4 } });
  assert.equal(s.text, "$(shield) 1 critical · 2 high"); // two most severe on the bar
  assert.equal(s.tooltip, "Reconix findings: 1 critical, 2 high, 4 low");
  assert.equal(s.tone, "error");
  assert.equal(statusBar({ connected: true, scanning: false, percent: 0, counts: { medium: 1 } }).tone, "warning");
  assert.equal(statusBar({ connected: true, scanning: false, percent: 0, counts: { low: 1 } }).tone, null);
});

test("findings on lines", () => {
  const list = [f({ id: "1", start_line: 3, end_line: 5 }), f({ id: "2", start_line: 9, end_line: 9 })];
  assert.deepEqual(findingsInLines(list, 4).map((x) => x.id), ["1"]);
  assert.deepEqual(findingsInLines(list, 5, 9).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(findingsInLines(list, 6, 8), []);
});

test("CWE links", () => {
  assert.equal(cweUrl("CWE-89"), "https://cwe.mitre.org/data/definitions/89.html");
  assert.equal(cweUrl(null), null);
  assert.equal(cweUrl("none"), null);
});

test("hover markdown has the review, links, and escapes the title", () => {
  const md = hoverMarkdown(f({ severity: "critical", title: "SQL *injection*", cwe: "CWE-89",
                               explanation: "User input reaches the query.", fix_recommendation: "Use parameters." }),
                           (cmd, label) => `<${cmd}|${label}>`);
  assert.match(md, /^\*\*CRITICAL\*\* · SQL \\\*injection\\\*/);
  assert.match(md, /_Likely real_ · `r` · \[CWE-89\]\(https:\/\/cwe\.mitre\.org\/data\/definitions\/89\.html\)/);
  assert.match(md, /\*\*What's wrong:\*\* User input reaches the query\./);
  assert.match(md, /<vulnScanner\.fixFinding\|\$\(wrench\) Fix>/);
  assert.match(hoverMarkdown(f({}), () => ""), /_Not reviewed yet_/);
});

test("Explorer badge is at most two characters", () => {
  assert.equal(badge(3), "3");
  assert.equal(badge(12), "9+");
});

test("CodeLens groups by innermost symbol", () => {
  const symbols = [{ name: "Cls", startLine: 1, endLine: 50 }, { name: "method", startLine: 10, endLine: 20 }];
  const groups = lensGroups([f({ id: "a", start_line: 12 }), f({ id: "b", start_line: 15 }),
                             f({ id: "c", start_line: 30 }), f({ id: "d", start_line: 70 }), f({ id: "e", start_line: 60 })], symbols);
  assert.deepEqual(groups, [
    { line: 1, name: "Cls", ids: ["c"] },
    { line: 10, name: "method", ids: ["a", "b"] },
    { line: 60, name: null, ids: ["d", "e"] }, // outside any symbol: at the first of them
  ]);
});

test("next / previous finding wraps around files", () => {
  const list = [f({ id: "b1", path: "b", start_line: 1 }), f({ id: "a5", path: "a", start_line: 5 }),
                f({ id: "a9", path: "a", start_line: 9 })];
  assert.equal(stepFinding(list, { path: "a", line: 5 }, 1)?.id, "a9");
  assert.equal(stepFinding(list, { path: "a", line: 9 }, 1)?.id, "b1");
  assert.equal(stepFinding(list, { path: "b", line: 1 }, 1)?.id, "a5"); // wraps
  assert.equal(stepFinding(list, { path: "a", line: 5 }, -1)?.id, "b1"); // wraps back
  assert.equal(stepFinding(list, { path: "a", line: 7 }, -1)?.id, "a5");
  assert.equal(stepFinding(list, null, 1)?.id, "a5");
  assert.equal(stepFinding([], null, 1), null);
});

test("tree groups: severity, then file, then line", () => {
  const groups = treeGroups([f({ id: "1", severity: "low", path: "z" }), f({ id: "2", severity: "critical", path: "b", start_line: 9 }),
                             f({ id: "3", severity: "critical", path: "b", start_line: 2 }), f({ id: "4", severity: "critical", path: "a" })]);
  assert.deepEqual(groups.map((g) => g.severity), ["critical", "low"]);
  assert.deepEqual(groups[0].files.map((x) => [x.path, x.findings.map((y) => y.id)]), [["a", ["4"]], ["b", ["3", "2"]]]);
});
