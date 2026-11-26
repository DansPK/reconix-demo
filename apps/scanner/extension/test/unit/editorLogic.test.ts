import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { commandFor, findingsNamed } from "../../src/routing";
import { mergeFindings } from "../../src/findingsLogic";
import {
  badge,
  codeSpan,
  explainFindingText,
  explainSelectionText,
  relativeContractPath,
  selectionLines,
  cweUrl,
  endLine,
  escapeMarkdown,
  findingsInLines,
  gutterIcon,
  gutterLines,
  hoverMarkdown,
  startLine,
  lensGroups,
  statusBar,
  stepFinding,
  treeGroups,
  worstSeverity,
} from "../../src/editorLogic";
import type { Finding } from "../../src/shared/contract";

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
    verdict: "LIKELY_TRUE_POSITIVE",
    path: "src/app.js",
    line: 10,
    message: "message",
    ...overrides,
  };
}

const fixLink = (action: string, label: string): string => `[${label}](command:${action})`;

test("UNKNOWN and NONE use the info gutter icon", () => {
  assert.equal(gutterIcon("CRITICAL"), "critical");
  assert.equal(gutterIcon("LOW"), "low");
  assert.equal(gutterIcon("UNKNOWN"), "info");
  assert.equal(gutterIcon("NONE"), "info");
});

test("a finding without a line sits on line 1; endLine never comes before the start", () => {
  assert.equal(startLine(finding({ line: undefined })), 1);
  assert.equal(endLine(finding({ line: undefined, endLine: undefined })), 1);
  assert.equal(endLine(finding({ line: 10, endLine: undefined })), 10);
  assert.equal(endLine(finding({ line: 10, endLine: 4 })), 10);
});

test("worstSeverity picks the most severe, and nothing for no findings", () => {
  assert.equal(worstSeverity([]), undefined);
  assert.equal(worstSeverity([finding({ severity: "LOW" }), finding({ severity: "CRITICAL" }), finding({ severity: "NONE" })]), "CRITICAL");
});

test("findingsInLines returns findings overlapping the range", () => {
  const a = finding({ id: "a", line: 5, endLine: 8 });
  const b = finding({ id: "b", line: 10 });
  assert.deepEqual(findingsInLines([a, b], 7).map((f) => f.id), ["a"]);
  assert.deepEqual(findingsInLines([a, b], 8, 10).map((f) => f.id), ["a", "b"]);
  assert.deepEqual(findingsInLines([a, b], 9), []);
});

test("one gutter icon per line: the most severe finding there wins", () => {
  const lines = gutterLines([
    finding({ line: 3, severity: "LOW" }),
    finding({ line: 3, severity: "CRITICAL" }),
    finding({ line: 7, severity: "LOW" }),
    finding({ line: 1, severity: "NONE" }),
  ]);
  assert.deepEqual(Object.fromEntries(lines), { info: [1], critical: [3], low: [7] });
});

test("badge has at most two characters", () => {
  assert.equal(badge(3), "3");
  assert.equal(badge(9), "9");
  assert.equal(badge(12), "9+");
});

test("cweUrl links to MITRE", () => {
  assert.equal(cweUrl("CWE-89"), "https://cwe.mitre.org/data/definitions/89.html");
  assert.equal(cweUrl("89"), "https://cwe.mitre.org/data/definitions/89.html");
  assert.equal(cweUrl("none"), undefined);
});

test("hover card: severity, title, verdict, rule, CWE links, tools, explanation, fix and the Fix link", () => {
  const md = hoverMarkdown(
    finding({ cwe: ["CWE-89"], tools: ["SEMGREP", "OSV_SCANNER"], explanation: "Bad", fixRecommendation: "Use params" }),
    fixLink,
  );
  assert.match(md, /^\*\*HIGH\*\* · Title/);
  assert.match(md, /_Likely real_ · `rule\\?.a`|_Likely real_ · `rule.a`/);
  assert.match(md, /\[CWE\\-89\]\(https:\/\/cwe\.mitre\.org\/data\/definitions\/89\.html\)/);
  assert.match(md, /SEMGREP \\\+ OSV\\_SCANNER/);
  assert.match(md, /\*\*What's wrong:\*\* Bad/);
  assert.match(md, /\*\*How to fix:\*\* Use params/);
  assert.ok(md.endsWith("[$(wrench) Fix](command:fix) &nbsp;·&nbsp; [$(comment-discussion) Explain](command:explain) &nbsp;·&nbsp; [$(eye-closed) Ignore](command:ignore)"));
});

test("hover card: a manual fix shows why instead of the Fix link", () => {
  const md = hoverMarkdown(finding({ manualFix: "Rotate the key" }), fixLink);
  assert.match(md, /\*\*Manual fix:\*\* Rotate the key/);
  assert.ok(!md.includes("command:fix"));
  assert.ok(md.includes("command:explain") && md.includes("command:ignore"), "Explain and Ignore stay");
});

test("untrusted text can't add links or command links to the hover card", () => {
  const evil = "[click](command:workbench.action.terminal.new) <img src=x> `code`";
  const md = hoverMarkdown(finding({ title: evil, explanation: evil, fixRecommendation: evil, ruleId: "r`x" }), fixLink);
  // The only links left are ours: Fix, Explain, Ignore.
  assert.equal((md.match(/\]\(/g) ?? []).length, 3);
  assert.ok(!/(?<!\\)\[click/.test(md));
  assert.ok(!/(?<!\\)</.test(md));
  assert.equal(escapeMarkdown("a\n\nb"), "a b");
});

test("a rule id with blank lines can't leave its code span", () => {
  const ruleId = "r\n\n[Open docs](https://evil.example/x)\n\n#";
  const md = hoverMarkdown(finding({ ruleId }), fixLink);
  assert.ok(md.includes("`r [Open docs](https://evil.example/x) #`"), "the rule id stays one code span on one line");
  assert.equal(md.split("\n").filter((l) => l.includes("evil")).length, 1);
  assert.equal(codeSpan("a`b\nc"), "`a'b c`");
});

test("a merged finding lists all its rules; an unknown verdict reads as Unsure; $ is escaped", () => {
  const md = hoverMarkdown({ ...finding({ title: "$(alert) x", verdict: "NEW" as never }), ruleIds: ["rule.a", "rule.b"] }, fixLink);
  assert.match(md, /_Unsure_ · `rule\.a` · `rule\.b`/);
  assert.ok(md.includes("\\$\\(alert\\)"));
});

test("status bar: disconnected, connecting and scanning come before the counts", () => {
  const counts = { HIGH: 2 };
  assert.deepEqual(statusBar({ connection: "disconnected", reason: "Server down.", counts }),
    { text: "$(debug-disconnect) Reconix", tooltip: "Reconix: not connected. Server down." });
  assert.equal(statusBar({ connection: "connecting", counts }).text, "$(sync~spin) Reconix");
  assert.equal(statusBar({ connection: "connected", scanning: 41.6, counts }).text, "$(sync~spin) Reconix 42%");
});

test("status bar: the two most severe levels, all of them in the tooltip, loud for serious ones", () => {
  assert.deepEqual(statusBar({ connection: "connected", counts: {} }), { text: "$(shield) Reconix", tooltip: "Reconix: no findings" });
  const s = statusBar({ connection: "connected", counts: { CRITICAL: 1, HIGH: 3, LOW: 2, NONE: 1 } });
  assert.equal(s.text, "$(shield) 1 critical · 3 high");
  assert.equal(s.tooltip, "Reconix findings: 1 critical, 3 high, 2 low, 1 info");
  assert.equal(s.tone, "error");
  assert.equal(statusBar({ connection: "connected", counts: { MEDIUM: 1 } }).tone, "warning");
  assert.equal(statusBar({ connection: "connected", counts: { LOW: 1 } }).tone, undefined);
});

test("tree groups: severity order, then files by path, then lines", () => {
  const groups = treeGroups([
    finding({ id: "a", severity: "LOW", path: "b.js", line: 9 }),
    finding({ id: "b", severity: "CRITICAL", path: "z.js", line: 4 }),
    finding({ id: "c", severity: "LOW", path: "b.js", line: 2 }),
    finding({ id: "d", severity: "LOW", path: "a.js", line: 1 }),
  ]);
  assert.deepEqual(groups.map((g) => [g.severity, g.files.map((f) => [f.path, f.findings.map((x) => x.id)])]), [
    ["CRITICAL", [["z.js", ["b"]]]],
    ["LOW", [["a.js", ["d"]], ["b.js", ["c", "a"]]]],
  ]);
  assert.deepEqual(treeGroups([]), []);
});

test("status bar: before the first status it shows the plain shield, and a clone at 0% still reads as scanning", () => {
  assert.deepEqual(statusBar({ connection: "unknown", counts: {} }), { text: "$(shield) Reconix", tooltip: "Reconix: no findings" });
  assert.equal(statusBar({ connection: "connected", scanning: 0, counts: {} }).text, "$(sync~spin) Reconix 0%");
});

test("stepFinding goes by path then line, and wraps around", () => {
  const list = [finding({ id: "b2", path: "b.js", line: 2 }), finding({ id: "a5", path: "a.js", line: 5 }), finding({ id: "a1", path: "a.js", line: 1 })];
  assert.equal(stepFinding([], undefined, 1), undefined);
  assert.equal(stepFinding(list, undefined, 1)?.id, "a1");
  assert.equal(stepFinding(list, undefined, -1)?.id, "b2");
  assert.equal(stepFinding(list, { path: "a.js", line: 1 }, 1)?.id, "a5");
  assert.equal(stepFinding(list, { path: "a.js", line: 3 }, 1)?.id, "a5");
  assert.equal(stepFinding(list, { path: "b.js", line: 2 }, 1)?.id, "a1", "wraps to the first");
  assert.equal(stepFinding(list, { path: "a.js", line: 1 }, -1)?.id, "b2", "wraps to the last");
  assert.equal(stepFinding(list, { path: "a.js", line: 9 }, -1)?.id, "a5");
  assert.equal(stepFinding(list, { path: "c.js", line: 1 }, 1)?.id, "a1", "a file after every finding");
});

test("lensGroups: one lens per innermost function, the rest above the first loose finding", () => {
  const symbols = [
    { name: "Router", startLine: 1, endLine: 40 },
    { name: "search", startLine: 10, endLine: 20 },
  ];
  const groups = lensGroups([
    finding({ id: "in-search-2", line: 15 }),
    finding({ id: "in-search-1", line: 11 }),
    finding({ id: "in-router", line: 30 }),
    finding({ id: "loose-2", line: 60 }),
    finding({ id: "loose-1", line: 50 }),
  ], symbols);
  assert.deepEqual(groups, [
    { line: 1, name: "Router", ids: ["in-router"] },
    { line: 10, name: "search", ids: ["in-search-1", "in-search-2"] },
    { line: 50, name: undefined, ids: ["loose-1", "loose-2"] },
  ]);
});

test("relativeContractPath: forward slashes inside the folder, nothing outside; Windows ignores casing", () => {
  assert.equal(relativeContractPath("/work/demo", "/work/demo/src/app.js", path.posix), "src/app.js");
  assert.equal(relativeContractPath("/work/demo/", "/work/demo/src/app.js", path.posix), "src/app.js");
  assert.equal(relativeContractPath("/work/demo", "/work/demo", path.posix), undefined);
  assert.equal(relativeContractPath("/work/demo", "/work/other/app.js", path.posix), undefined);
  assert.equal(relativeContractPath("/work/demo", "/work/demo/..x/app.js", path.posix), "..x/app.js");
  assert.equal(relativeContractPath("c:\\Users\\me\\demo", "C:\\Users\\me\\demo\\src\\x.js", path.win32), "src/x.js");
  assert.equal(relativeContractPath("c:\\demo", "d:\\demo\\x.js", path.win32), undefined);
});

test("Explain names the finding by id, file, line and rule; static chat answers it and runs nothing", () => {
  const f = finding({ id: "f-9f40187b4a", title: "SQL\ninjection", path: "src/routes/users.js", line: 11, ruleId: "rule.sqli" });
  const text = explainFindingText(f);
  assert.equal(text, 'Explain finding f-9f40187b4a ("SQL injection") in src/routes/users.js:11 (rule rule.sqli): why is it a problem here, and how should I fix it?');
  const merged = mergeFindings([f]);
  assert.equal(commandFor(text, { findings: merged, lastMentioned: [] }), undefined, "a question, not a command");
  assert.deepEqual(findingsNamed(text, merged).map((x) => x.id), ["f-9f40187b4a"]);
});

test("Explain Selection: lines only, a selection ending at column 0 leaves that line out", () => {
  assert.deepEqual(selectionLines({ start: { line: 10 }, end: { line: 13, character: 4 } }), { first: 11, last: 14 });
  assert.deepEqual(selectionLines({ start: { line: 10 }, end: { line: 13, character: 0 } }), { first: 11, last: 13 });
  assert.deepEqual(selectionLines({ start: { line: 10 }, end: { line: 10, character: 0 } }), { first: 11, last: 11 });
  assert.equal(explainSelectionText("src/a.js", 3, 3), "Look at src/a.js line 3: is there a security problem in that code, and how would I fix it?");
  assert.equal(explainSelectionText("src/a.js", 3, 7), "Look at src/a.js lines 3-7: is there a security problem in that code, and how would I fix it?");
});
