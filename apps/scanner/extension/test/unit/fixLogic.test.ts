import assert from "node:assert/strict";
import { test } from "node:test";
import type { MergedFinding } from "../../src/findingsLogic";
import { applyEdits, coreNotFixable, fixAllIds, fixOutcomeText, fixPlanText, MAX_FIX_FINDINGS, mergedOutcomes, mergeEdits } from "../../src/fixLogic";

test("mergeEdits sorts edits and drops the ones that overlap an earlier edit", () => {
  const { kept, dropped } = mergeEdits([
    { startLine: 5, endLine: 6, replacement: "b" },
    { startLine: 1, endLine: 2, replacement: "a" },
    { startLine: 6, endLine: 7, replacement: "overlaps b" },
  ]);
  assert.deepEqual(kept.map((e) => e.replacement), ["a", "b"]);
  assert.deepEqual(dropped.map((e) => e.replacement), ["overlaps b"]);
});

test("applyEdits replaces, inserts and deletes whole lines and keeps CRLF endings", () => {
  const text = "one\r\ntwo\r\nthree\r\nfour";
  const result = applyEdits(text, [
    { startLine: 1, endLine: 1, replacement: "ONE\nONE-B" },
    { startLine: 3, endLine: 3, replacement: "" },
  ]);
  assert.equal(result, "ONE\r\nONE-B\r\ntwo\r\nfour");
});

test("applyEdits refuses edits outside the file", () => {
  assert.throws(() => applyEdits("a\nb", [{ startLine: 2, endLine: 3, replacement: "x" }]), /outside the file/);
});

const merged = (id: string, verdict: MergedFinding["verdict"], hits = 1) =>
  ({ id, verdict, findingIds: Array.from({ length: hits }, (_, i) => (i === 0 ? id : `${id}-${i}`)) }) as MergedFinding;

test("fixAllIds skips likely false alarms and keeps order", () => {
  const { ids, leftOut } = fixAllIds([merged("a", "CONFIRMED"), merged("b", "LIKELY_FALSE_POSITIVE"), merged("c", "UNVERIFIED")]);
  assert.deepEqual(ids, ["a", "c"]);
  assert.equal(leftOut, 0);
});

test("fixAllIds caps the request by raw hits, not merged findings", () => {
  const many = Array.from({ length: 150 }, (_, i) => merged(`f${i}`, "CONFIRMED", 2));
  const { ids, leftOut } = fixAllIds(many);
  assert.equal(ids.length, MAX_FIX_FINDINGS / 2);
  assert.equal(leftOut, 150 - MAX_FIX_FINDINGS / 2);
});

test("mergedOutcomes keeps the worst status of a finding's hits and covers missing ones", () => {
  const targets = [merged("a", "CONFIRMED", 2), merged("b", "CONFIRMED")];
  const outcomes = mergedOutcomes(
    [
      { findingId: "a", status: "FIXED", note: "semgrep is happy" },
      { findingId: "a-1", status: "STILL_REPORTED", note: "gitleaks still sees it" },
    ],
    targets,
  );
  assert.deepEqual(outcomes, [
    { findingId: "a", status: "STILL_REPORTED", note: "gitleaks still sees it" },
    { findingId: "b", status: "NOT_FIXED", note: "The fix agent returned no result for this finding." },
  ]);
});

test("fixOutcomeText counts results and lists what was not fixed", () => {
  const text = fixOutcomeText(
    "- `a.js`: fixed it.",
    [
      { findingId: "1", status: "FIXED", note: "done" },
      { findingId: "2", status: "NOT_FIXED", note: "needs a package upgrade" },
    ],
    (id) => `Finding ${id}`,
  );
  assert.equal(text, "Fix agent: 1 fixed and confirmed by the scanners, 1 not changed.\n\n- `a.js`: fixed it.\n\n- ⏭️ not changed: Finding 2: needs a package upgrade");
});

test("fixOutcomeText leads with the reason when nothing was changed", () => {
  const title = (id: string): string => `Finding ${id}`;
  assert.equal(
    fixOutcomeText("", [{ findingId: "1", status: "NOT_FIXED", note: "This needs a package upgrade (axios@0.21.0)." }], title),
    "Not changed: Finding 1.\n\nThis needs a package upgrade (axios@0.21.0).",
  );
  const several = fixOutcomeText("", [
    { findingId: "1", status: "NOT_FIXED", note: "needs a package upgrade" },
    { findingId: "2", status: "NOT_FIXED", note: "rotate the key" },
  ], title);
  assert.equal(several, "Nothing was changed. None of these 2 findings can be fixed automatically:\n\n- Finding 1: needs a package upgrade\n- Finding 2: rotate the key");
  assert.ok(!several.includes("0 fixed"));
});

test("fixAllIds leaves out findings that need a manual fix and counts them", () => {
  const manual = { ...merged("m", "CONFIRMED"), manualFix: "upgrade it" } as MergedFinding;
  const { ids, manual: count } = fixAllIds([merged("a", "CONFIRMED"), manual, merged("fp", "LIKELY_FALSE_POSITIVE")]);
  assert.deepEqual(ids, ["a"]);
  assert.equal(count, 1);
});

test("fixOutcomeText says how many more problems there are past the first 15", () => {
  const results = [
    { findingId: "ok", status: "FIXED" as const, note: "done" },
    ...Array.from({ length: 45 }, (_, i) => ({ findingId: `p${i}`, status: "NOT_FIXED" as const, note: "why" })),
  ];
  const lines = fixOutcomeText("", results, (id) => id).split("\n");
  assert.equal(lines.filter((l) => l.startsWith("- ⏭️")).length, 15);
  assert.equal(lines.at(-1), "- …and 30 more not fixed. Rescan to see which findings remain.");
  const fifteen = fixOutcomeText("", results.slice(0, 16), (id) => id);
  assert.ok(!fifteen.includes("- …and "), "exactly 15 problems: no '…and N more' line");
  assert.ok(fifteen.split("\n").at(-1)?.startsWith("- ⏭️"), "it ends with the 15th problem");
});

test("coreNotFixable mirrors core: leaked secrets, dependency manifests, and findings with no line", () => {
  const code = { tools: ["SEMGREP"], path: "src/app.js", line: 4 };
  assert.equal(coreNotFixable(code), undefined);
  assert.match(coreNotFixable({ tools: ["GITLEAKS"], path: ".env", line: 3 }) ?? "", /rotate it/);
  assert.match(coreNotFixable({ tools: ["SEMGREP", "GITLEAKS"], path: "src/config.js", line: 3 }) ?? "", /rotate it/, "any GITLEAKS hit");
  assert.match(coreNotFixable({ tools: ["OSV_SCANNER"], path: "package-lock.json", line: 1 }) ?? "", /Upgrade the package/);
  assert.match(coreNotFixable({ tools: ["TRIVY", "GRYPE"], path: "api/requirements-dev.txt", line: 2 }) ?? "", /Upgrade the package/, "a nested manifest");
  assert.equal(coreNotFixable({ tools: ["TRIVY"], path: "Dockerfile", line: 1 }), undefined, "trivy on IaC is a code fix");
  assert.equal(coreNotFixable({ tools: ["OSV_SCANNER", "SEMGREP"], path: "package.json", line: 1 }), undefined, "not only dependency tools");
  assert.match(coreNotFixable({ tools: ["SEMGREP"], path: "src/app.js" }) ?? "", /no line/);
  assert.match(coreNotFixable({ tools: ["SEMGREP"], path: "", line: 2 }) ?? "", /no line/);
});

test("fixPlanText counts merged findings and says how many scanner hits they came from", () => {
  // The case from the chat: 74 hits, 52 findings, 39 manual, 13 to fix in 9 files.
  const big = fixPlanText({ hits: 74, merged: 52, manual: 39, fixable: 13, chosen: 13, files: 9 });
  assert.equal(big.ask, true);
  assert.equal(big.text, "Of 52 findings (74 scanner hits), 39 need a manual fix (see the Findings tab), so I'm leaving them out. " +
    "Fix the other 13 findings in 9 files? When the agent is done you can apply all changes at once or review each file first.");

  const merged = fixPlanText({ hits: 3, merged: 2, manual: 0, fixable: 2, chosen: 2, files: 1 });
  assert.equal(merged.ask, false);
  assert.equal(merged.text, "Those 3 scanner hits are 2 findings: some problems were reported by more than one scanner. " +
    "Preparing fixes for 2 findings. You'll see every change before it is applied.");

  const one = fixPlanText({ hits: 1, merged: 1, manual: 0, fixable: 1, chosen: 1, files: 1, single: "**SQLi** (`a.js:3`)" });
  assert.deepEqual(one, { text: "Preparing a fix for **SQLi** (`a.js:3`). You'll see the change before it is applied.", ask: false });

  const capped = fixPlanText({ hits: 20, merged: 20, manual: 1, fixable: 19, chosen: 12, files: 4 });
  assert.equal(capped.text, "Of 20 findings, 1 needs a manual fix (see the Findings tab), so I'm leaving it out. " +
    "Fix the other 12 findings (the first 12 of 19) in 4 files? When the agent is done you can apply all changes at once or review each file first.");
});
