import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeFindings, prepareFindings } from "../../src/findingsLogic";
import { commandFor, fixTargets, githubRepoUrl, MAX_COMMAND_CHARS, providerNamed, refersBack, routeMessage } from "../../src/routing";
import type { Finding } from "../../src/shared/contract";
import { LUMINA } from "./helpers";

const raw: Finding[] = LUMINA;
const shown = prepareFindings(raw, false).findings;

test("routeMessage trims text and routes it to chat", () => {
  assert.deepEqual(routeMessage("  hello  "), { kind: "chat", text: "hello" });
});

test("routeMessage treats whitespace-only input as empty", () => {
  assert.deepEqual(routeMessage(" \n\t "), { kind: "empty" });
});

test("routeMessage recognises the reference's commands", () => {
  const kind = (text: string): string => routeMessage(text).kind;
  assert.equal(kind("Scan this project"), "scan");
  assert.equal(kind("please analyze the workspace"), "scan");
  assert.equal(kind("rescan"), "rescan");
  assert.equal(kind("stop"), "cancel");
  assert.equal(kind("Cancel the scan"), "cancel");
  assert.equal(kind("Fix all high findings"), "fix");
  assert.equal(kind("can you fix exec.js"), "fix");
  assert.equal(kind("Summarize all findings"), "summarize");
  assert.equal(kind("show findings"), "showFindings");
  assert.equal(kind("Scan https://github.com/owner/repo"), "github");
  assert.deepEqual(routeMessage("Scan everything again from scratch"), { kind: "scan", text: "Scan everything again from scratch", full: true });
  assert.deepEqual(routeMessage("scan this project"), { kind: "scan", text: "scan this project", full: false });
});

test("questions and messages about findings are chat, not scans", () => {
  for (const text of ["What are the most serious problems?", "check this finding", "How do I fix the SQL injection?",
    "Explain finding f-000000", "what did the scan find in this project?", "use this to learn"]) {
    assert.equal(routeMessage(text).kind, "chat", text);
  }
});

test("routeMessage strips trailing punctuation and .git from GitHub URLs", () => {
  const route = routeMessage("scan https://github.com/lumina-store/lumina-site.git.");
  assert.equal(route.kind === "github" && route.url, "https://github.com/lumina-store/lumina-site");
});

test("fixTargets picks by severity, most serious and real first, leaving out false alarms", () => {
  const high = fixTargets("fix all high findings", shown);
  assert.ok(high.length > 0);
  assert.ok(high.every((f) => f.severity === "HIGH" && f.verdict !== "LIKELY_FALSE_POSITIVE"));
  const both = fixTargets("fix the critical and high ones", shown);
  assert.ok(both.some((f) => f.severity === "CRITICAL") && both.some((f) => f.severity === "HIGH"));
  const firstHigh = both.findIndex((f) => f.severity === "HIGH");
  assert.ok(both.slice(0, firstHigh).every((f) => f.severity === "CRITICAL"), "critical before high");
});

test("fixTargets picks by file name or path, by id, or everything", () => {
  assert.ok(fixTargets("fix exec.js", shown).every((f) => f.path === "server/routes/exec.js"));
  assert.ok(fixTargets("fix server/session.js", shown).every((f) => f.path === "server/session.js"));
  assert.deepEqual(fixTargets("fix f-000000 please", shown).map((f) => f.id), ["f-000000"]);
  const all = fixTargets("fix everything", shown);
  assert.equal(all.length, shown.filter((f) => f.verdict !== "LIKELY_FALSE_POSITIVE").length);
  assert.deepEqual(fixTargets("fix it", shown), []);
  assert.deepEqual(fixTargets("fix the bug", shown), []);
});

test("fixTargets finds a merged finding by any of its raw ids, including a named false alarm", () => {
  const merged = mergeFindings(raw);
  const multi = merged.find((f) => f.findingIds.length > 1);
  assert.ok(multi, "the fixtures have same-line hits");
  assert.deepEqual(fixTargets(`fix ${multi.findingIds[1]}`, merged).map((f) => f.id), [multi.id]);
  const falseAlarm = merged.find((f) => f.verdict === "LIKELY_FALSE_POSITIVE");
  assert.ok(falseAlarm);
  assert.deepEqual(fixTargets(`fix ${falseAlarm.id}`, merged).map((f) => f.id), [falseAlarm.id]);
});

test("refersBack spots 'fix it' style messages", () => {
  assert.ok(refersBack("fix it"));
  assert.ok(refersBack("fix these"));
  assert.ok(!refersBack("fix all high findings"));
});

test("commandFor turns clear commands into ChatCommands and leaves questions alone", () => {
  const context = { findings: shown, lastMentioned: [] };
  assert.deepEqual(commandFor("scan this project", context), { kind: "scan" });
  assert.deepEqual(commandFor("rescan", context), { kind: "scan" });
  assert.deepEqual(commandFor("scan everything again from scratch", context), { kind: "scan", full: true });
  assert.deepEqual(commandFor("stop", context), { kind: "cancel" });
  assert.deepEqual(commandFor("scan https://github.com/owner/repo.git", context), { kind: "scanGithub", url: "https://github.com/owner/repo" });
  assert.deepEqual(commandFor("summarize", context), { kind: "summarize" });
  assert.deepEqual(commandFor("show findings", context), { kind: "showFindings" });
  assert.equal(commandFor("What are the most serious problems?", context), undefined);
  assert.equal(commandFor("   ", context), undefined);
});

test("commandFor picks fix targets, or the last mentioned findings for 'fix it'", () => {
  const high = commandFor("fix all high findings", { findings: shown, lastMentioned: [] });
  assert.deepEqual(high?.findingIds, fixTargets("fix all high findings", shown).map((f) => f.id));
  assert.deepEqual(commandFor("fix it", { findings: shown, lastMentioned: ["f-1", "f-2"] }), { kind: "fix", findingIds: ["f-1", "f-2"] });
  assert.deepEqual(commandFor("fix the bug", { findings: shown, lastMentioned: ["f-1"] }), { kind: "fix", findingIds: [] });
});

test("a long message is never a command, even with padding", () => {
  assert.equal(routeMessage(`scan this project ${"x".repeat(MAX_COMMAND_CHARS)}`).kind, "chat");
  assert.equal(routeMessage(`${" ".repeat(MAX_COMMAND_CHARS)}stop`).kind, "chat");
});

test("no message makes the matching slow", () => {
  for (const text of [
    `show ${" ".repeat(20000)}findings`,
    `show findings${" ".repeat(MAX_COMMAND_CHARS - 14)}x`,
    `show ${"findings ".repeat(30)}`,
  ]) {
    const started = performance.now();
    routeMessage(text);
    assert.ok(performance.now() - started < 50, `${text.length} chars took too long`);
  }
});

test("githubRepoUrl accepts core's repo address forms and nothing else", () => {
  const plain = "https://github.com/lumina-store/lumina-site";
  for (const ok of [plain, `${plain}.git`, `${plain}/`, `  ${plain}  `]) assert.equal(githubRepoUrl(ok), plain, ok);
  for (const bad of ["http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b/tree/main",
    "https://github.com/a/..", "github.com/a/b", "https://github.com/a/b?x=1"]) assert.equal(githubRepoUrl(bad), undefined, bad);
});

const models = [
  { id: "m1", displayName: "GPT-4o", modelName: "gpt-4o" },
  { id: "m2", displayName: "GPT-4o mini", modelName: "gpt-4o-mini" },
  { id: "m3", displayName: "Qwen2.5 Coder", modelName: "qwen2.5-coder:7b" },
];

test("switch to / change the model to / use the … model are model switches", () => {
  for (const [text, name] of [
    ["switch to gpt-4o", "gpt-4o"],
    ["Switch to the Qwen model", "Qwen"],
    ["change the model to GPT-4o mini.", "GPT-4o mini"],
    ["please use the qwen model", "qwen"],
    ["switch llm to qwen2.5-coder:7b", "qwen2.5-coder:7b"],
  ]) {
    assert.deepEqual(routeMessage(text), { kind: "switchModel", text: text.trim(), name }, text);
  }
  // Not switches: "use …" without "model", questions, and fixes.
  assert.equal(routeMessage("use parameterized queries").kind, "chat");
  assert.equal(routeMessage("which model should I switch to?").kind, "chat");
  assert.equal(routeMessage("fix it and switch to gpt-4o").kind, "fix");
});

test("providerNamed: an exact name first, else the only partial match", () => {
  assert.equal(providerNamed("gpt-4o", models)?.id, "m1", "exact beats the longer gpt-4o-mini");
  assert.equal(providerNamed("GPT-4O MINI", models)?.id, "m2");
  assert.equal(providerNamed("qwen", models)?.id, "m3");
  assert.equal(providerNamed("gpt", models), undefined, "two partial matches: ask instead");
  assert.equal(providerNamed("claude", models), undefined);
});

test("commandFor: switchModel with the model's id, or without one to ask which", () => {
  const context = { findings: [], lastMentioned: [], providers: models };
  assert.deepEqual(commandFor("switch to qwen", context), { kind: "switchModel", providerId: "m3" });
  assert.deepEqual(commandFor("switch to gpt", context), { kind: "switchModel" }, "two models match: ask which");
  // No models known: nothing to match, so it goes to the chat (unless it says "model").
  assert.equal(commandFor("switch to gpt-4o", { findings: [], lastMentioned: [] }), undefined);
  assert.deepEqual(commandFor("switch to the gpt-4o model", { findings: [], lastMentioned: [] }), { kind: "switchModel" });
});

test("'switch/change … to X' that names no model and says no 'model' goes to the other rules", () => {
  const context = { findings: shown, lastMentioned: [], providers: models };
  assert.equal(commandFor("switch to dark mode", context), undefined, "a question for the chat");
  assert.equal(commandFor("change to the next finding", context), undefined);
  assert.equal(commandFor("switch to the findings tab", context), undefined);
  assert.deepEqual(commandFor("Switch to summary", context), { kind: "summarize" });
  assert.deepEqual(commandFor("switch to scan this project", context), { kind: "scan" });
  // Saying "model" keeps it a switch, which then asks which one.
  assert.deepEqual(commandFor("use a different model", context), { kind: "switchModel" });
  assert.deepEqual(commandFor("switch the model to dark mode", context), { kind: "switchModel" });
});

test("empty, one- or two-letter names never pick a model; a trailing ? is not part of the name", () => {
  const context = { findings: [], lastMentioned: [], providers: models };
  assert.equal(commandFor("use   model", context)?.providerId, undefined);
  assert.equal(commandFor("switch to c", context), undefined);
  assert.equal(commandFor("switch to .", context), undefined);
  assert.equal(providerNamed("", models), undefined);
  assert.equal(providerNamed("qw", models), undefined);
  assert.deepEqual(commandFor("switch to gpt-4o?", context), { kind: "switchModel", providerId: "m1" });
});
