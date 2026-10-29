/* The combined report's model (lib/report/combined/select.ts) on the sample runs: unique
   findings against occurrences, the options, the limitations, and that nothing is invented. */
import { describe, expect, it } from "vitest";

import type { Assessment } from "@/lib/data/schema";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { combineAssessments, cweOf, identityOf, normaliseTitle } from "@/lib/report/combined/select";

import { sampleAssessments } from "./fixtures";

const all = sampleAssessments();
const byLabel = (uid: string) => all.find((a) => a.uid === uid)!;
/* Two sample runs record "Broken object-level authorization" (CWE-639) at the same URL. */
const api1 = byLabel("20260930-160500-8a01_RCX-001");
const api2 = byLabel("20261003-101500-3ceb_RCX-002");
const opts = DEFAULT_COMBINE_OPTIONS;

describe("the identity of a finding", () => {
  it("ignores case, punctuation and spacing in the title", () => {
    expect(normaliseTitle("  Broken   Object-Level Authorization! ")).toBe("broken object level authorization");
  });
  it("takes the CWE from `cwe`, else from a CWE reference, else none", () => {
    expect(cweOf({ cwe: ["cwe-639"], references: [] })).toBe("CWE-639");
    expect(cweOf({ cwe: [], references: ["OWASP A01:2021", "CWE-79"] })).toBe("CWE-79");
    expect(cweOf({ cwe: [], references: ["OWASP A01:2021"] })).toBeNull();
  });
  it("is the title, the CWE and the target", () => {
    const f = { title: "X", cwe: ["CWE-1"], references: [], affected_url: "https://a.example/p", path: "/p" };
    expect(identityOf(f)).toBe("x|CWE-1|https://a.example/p");
    expect(identityOf({ ...f, affected_url: "" })).toBe("x|CWE-1|/p");
    expect(identityOf({ ...f, affected_url: "https://b.example/p" })).not.toBe(identityOf(f));
  });
});

describe("combineAssessments", () => {
  const r = combineAssessments([api2, api1], opts);

  it("puts the oldest run first and names every run on the cover", () => {
    expect(r.cover.runs.map((x) => x.uid)).toEqual([api1.uid, api2.uid]);
    expect(r.cover.targets).toEqual(["https://api.example.com"]);
    expect(r.cover.operators).toEqual(["analyst"]);
    expect(r.cover.from).toBe(new Date(api1.run.started_at!).toISOString());
    expect(r.cover.to).toBe(new Date(api2.run.finished_at!).toISOString());
    expect(r.title).toBe("Combined security assessment report");
  });

  it("folds the same title, CWE and target across runs into one unique finding with two occurrences", () => {
    const bola = r.findings.find((u) => u.title === "Broken object-level authorization")!;
    expect(bola.cwe).toBe("CWE-639");
    expect(bola.occurrences).toHaveLength(2);
    expect(bola.occurrences.map((o) => o.uid)).toEqual([api1.uid, api2.uid]);
    expect(bola.runs).toEqual(["RCX-001", "RCX-002"]);
    // each occurrence keeps its own facts and traces to its file
    for (const o of bola.occurrences) {
      const own = (o.uid === api1.uid ? api1 : api2).findings.find((f) => f.id === o.id)!;
      expect(o.key).toBe(`${o.uid}~${own.id}`);
      expect(o.severity).toBe(own.severity);
      expect(o.cvss).toBe(own.cvss_score);
      expect(o.validation).toBe(own.validation);
      expect(o.evidence).toEqual(own.evidence);
    }
    expect(r.summary.occurrences).toBe(api1.findings.length + api2.findings.length);
    expect(r.summary.unique).toBe(r.summary.occurrences - 1);
  });

  it("orders unique findings by worst severity, then CVSS, then how often they were seen", () => {
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (let i = 1; i < r.findings.length; i += 1) {
      const a = r.findings[i - 1];
      const b = r.findings[i];
      const sev = order.indexOf(a.severity) - order.indexOf(b.severity);
      expect(sev <= 0).toBe(true);
      if (sev === 0) expect((a.cvss ?? -1) >= (b.cvss ?? -1)).toBe(true);
      if (sev === 0 && a.cvss === b.cvss) expect(a.occurrences.length >= b.occurrences.length).toBe(true);
    }
    expect(r.priorities.map((p) => p.key)).toEqual(r.findings.map((u) => u.key));
    expect(r.priorities[0].rank).toBe(1);
    expect(r.summary.topRisks.length).toBeLessThanOrEqual(5);
    expect(r.summary.worst).toBe(r.findings[0].severity);
  });

  it("counts every number from the files", () => {
    const sum = (k: keyof typeof r.summary.uniqueBySeverity) => r.summary.uniqueBySeverity[k];
    expect(Object.keys(r.summary.uniqueBySeverity)).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    expect(sum("CRITICAL") + sum("HIGH") + sum("MEDIUM") + sum("LOW")).toBe(r.summary.unique);
    expect(r.summary.byStatus).toEqual([
      { status: "Completed", count: 1 },
      { status: "Stopped", count: 1 },
    ]);
    const s1 = r.runs[0];
    expect(s1.requests).toBe(api1.run.requests);
    expect(s1.plan.total).toBe(api1.plan.length);
    expect(s1.blocked).toBe(api1.verdicts.filter((v) => !v.allowed).length);
    expect(s1.approvals.total).toBe(api1.approvals.length);
    expect(s1.findings).toHaveLength(api1.findings.length);
    expect(s1.missing).toEqual([]);
  });

  it("lists a stopped run and its unfinished plan as limitations", () => {
    const texts = r.limitations.map((l) => l.text);
    expect(texts.some((t) => t.startsWith("RCX-002 was stopped"))).toBe(true);
    expect(texts.some((t) => /RCX-002 completed \d+ of \d+ plan steps/.test(t))).toBe(true);
    expect(r.limitations.filter((l) => l.run === "RCX-001")).toEqual([]);
  });

  it("builds the appendix from the tools, references and uids", () => {
    expect(r.appendix!.uids).toEqual([api1.uid, api2.uid]);
    expect(r.appendix!.tools.every((t) => t.runs.length >= 1)).toBe(true);
    expect(r.appendix!.references.find((x) => x.ref === "CWE-639")!.count).toBe(2);
    expect(r.appendix!.weaknesses.find((x) => x.cwe === "CWE-639")!.count).toBe(1);
  });
});

describe("the options", () => {
  it("leave out LOW findings, and say so", () => {
    const full = combineAssessments([api1, api2], opts);
    const r = combineAssessments([api1, api2], { ...opts, low: false });
    const minor = full.findings.flatMap((u) => u.occurrences).filter((o) => o.severity === "LOW").length;
    expect(minor).toBeGreaterThan(0);
    expect(r.summary.occurrences).toBe(full.summary.occurrences - minor);
    expect(r.findings.every((u) => u.severity !== "LOW")).toBe(true);
    expect(r.summary.leftOut.minor).toBe(minor);
    expect(r.limitations.some((l) => l.kind === "left-out" && l.text === `LOW findings were left out by the report's options (${minor} in these runs).`)).toBe(true);
    // the priorities and the top risks drop them too
    expect(r.priorities.every((p) => p.severity !== "LOW")).toBe(true);
    expect(r.summary.topRisks.every((u) => u.severity !== "LOW")).toBe(true);
    expect(r.priorities.length).toBe(full.priorities.length - full.priorities.filter((p) => p.severity === "LOW").length);
  });

  it("say nothing was dropped when no LOW finding existed", () => {
    const high = { ...api1, findings: api1.findings.filter((f) => f.severity === "MEDIUM") };
    const r = combineAssessments([high], { ...opts, low: false });
    const line = r.limitations.find((l) => l.text.startsWith("LOW findings"))!;
    expect(line.text).toBe("LOW findings were left out by the report's options.");
  });

  it("leave out the evidence lines and the appendix", () => {
    const r = combineAssessments([api1], { evidence: false, low: true, appendix: false });
    expect(r.findings.flatMap((u) => u.occurrences).every((o) => o.evidence.length === 0)).toBe(true);
    expect(r.appendix).toBeNull();
    expect(r.limitations.map((l) => l.kind)).toEqual(["left-out", "left-out"]);
  });
});

describe("missing data", () => {
  const interrupted: Assessment = {
    ...api1,
    uid: "20261010-101010-abcd_RCX-TEST-009",
    assessment_id: "RCX-TEST-009",
    status: "Interrupted",
    stopped_reason: "the terminal closed",
    scope: null,
    plan: [],
    run: { ...api1.run, started_at: null, finished_at: null },
    findings: [{ ...api1.findings[0], status: "false-positive" }],
  };

  it("is said, never filled in", () => {
    const r = combineAssessments([interrupted, api1], opts);
    const s = r.runs.find((x) => x.uid === interrupted.uid)!;
    expect(s.missing).toEqual(["scope", "plan", "timing"]);
    expect(s.scope).toBeNull();
    expect(s.findings).toEqual([]);
    expect(s.details.find((d) => d.label === "Started")!.value).toBe("not started");
    const texts = r.limitations.map((l) => l.text);
    expect(texts).toContain("RCX-TEST-009 was interrupted before it finished: its findings and coverage may be incomplete (the terminal closed).");
    expect(texts).toContain("RCX-TEST-009 has no Scope Manifest saved: the boundary of its testing is not recorded.");
    expect(texts).toContain("RCX-TEST-009 has no plan or timing saved.");
    expect(texts).toContain("1 finding marked as false positive was left out.");
    expect(r.summary.leftOut.falsePositives).toBe(1);
    expect(r.summary.byStatus).toEqual([
      { status: "Completed", count: 1 },
      { status: "Interrupted", count: 1 },
    ]);
  });

  it("notes a scope that was never approved", () => {
    const draft = { ...api1, scope: { ...api1.scope!, status: "DRAFT" } };
    const r = combineAssessments([draft, api2], opts);
    expect(r.limitations.map((l) => l.text)).toContain("RCX-001's scope was not approved (DRAFT): testing could not start inside an approved boundary.");
    expect(r.summary.scopesApproved).toBe(1);
    expect(combineAssessments([api1, api2], opts).summary.scopesApproved).toBe(2);
  });

  it("does not call a completed run with no findings incomplete", () => {
    const clean = { ...api1, findings: [] };
    const r = combineAssessments([clean], opts);
    expect(r.runs[0].missing).toEqual([]);
    expect(r.runs[0].finished).toBe(true);
    expect(r.limitations).toEqual([]);
    const unfinished = combineAssessments([{ ...clean, status: "Stopped" }], opts);
    expect(unfinished.runs[0].missing).toEqual(["findings"]);
    expect(unfinished.runs[0].finished).toBe(false);
  });
});

describe("edge cases of the identity", () => {
  it("folds two same-identity findings inside one run into one unique finding, counting the run once", () => {
    const twice = { ...api1, findings: [api1.findings[0], { ...api1.findings[0], id: "001-dup", validation: "UNCONFIRMED" }] };
    const r = combineAssessments([twice], opts);
    expect(r.summary.unique).toBe(1);
    expect(r.summary.occurrences).toBe(2);
    expect(r.findings[0].occurrences.map((o) => o.id)).toEqual(["001", "001-dup"]);
    expect(r.findings[0].runs).toEqual(["RCX-001"]);
    expect(r.findings[0].confirmed).toBe(true);
  });

  it("breaks ties by CVSS, then occurrences, then title", () => {
    const base = { ...api1.findings[0], severity: "MEDIUM" as const, cwe: [], references: [], affected_url: "" };
    const mk = (title: string, cvss: number, path: string) => ({ ...base, id: `${title}-${path}`, title, cvss_score: cvss, path });
    const one = { ...api1, findings: [mk("Beta", 5, "/a"), mk("Alpha", 5, "/b"), mk("Gamma", 7, "/c"), mk("Seen twice", 5, "/d")] };
    const two = { ...api2, findings: [mk("Seen twice", 5, "/d")] };
    const r = combineAssessments([one, two], opts);
    expect(r.findings.map((u) => u.title)).toEqual(["Gamma", "Seen twice", "Alpha", "Beta"]);
  });
});
