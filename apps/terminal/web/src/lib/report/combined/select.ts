/* One model for a report that combines several saved runs (CombinedReport), built from the
   assessments as the store read them. Pure: no I/O, and nothing invented — every number counts
   what the files hold, and what a run lacks is said (`missing`, the limitations) rather than
   filled in.

   A **unique finding** is the same weakness at the same place: the normalised title, the CWE
   (the first `cwe`, else the first `CWE-…` reference) and the target. Each run it appears in is
   an **occurrence**, kept whole (its own severity, CVSS, validation and masked evidence) so every
   line traces back to a uid. False positives are left out and counted; LOW findings are left
   out when the `low` option is off, and counted too. The route masks the assessments once
   more before they get here (lib/report/mask.ts); this builder copies text as given. */
import { type Assessment, type Finding, SEVERITIES, type Severity, type Status, STATUSES } from "@/lib/data/schema";
import { effectiveSeverity, isConfirmed, isFalsePositive } from "@/lib/data/stats";

import { sevRank } from "../html";
import type { CombineOptions } from "./options";

export const COMBINED_TITLE = "Combined security assessment report";

const MINOR: ReadonlySet<Severity> = new Set(["LOW"]);
const CWE = /^CWE-\d+$/i;

// --- the model ---------------------------------------------------------------------------

export interface RunRef {
  uid: string;
  id: string; // the assessment id, or its label
  template: string;
  target: string;
  status: Status;
  operator: string;
  client: string;
  startedAt: string | null; // ISO, when testing began
  finishedAt: string | null; // ISO, when it ended (null while it goes on, or when it never did)
}

/** One finding of one run, as its file holds it. */
export interface Occurrence {
  key: string; // "<uid>~<finding id>": unique across runs
  uid: string;
  runId: string;
  id: string;
  title: string;
  severity: Severity; // the analyst's severity when one was set
  cvss: number | null;
  cvssVector: string;
  validation: string;
  confirmed: boolean;
  status: string; // triage
  tool: string;
  target: string; // affected URL, else the path
  location: string;
  category: string;
  cwe: string | null;
  references: string[]; // references, OWASP, CVE and CWE, each once
  description: string;
  impact: string;
  remediation: string;
  evidence: string[]; // masked lines, or empty when the option is off
  note: string; // the analyst's triage note
}

/** The same weakness at the same place across runs. */
export interface UniqueFinding {
  key: string; // the identity: normalised title, CWE and target
  title: string;
  cwe: string | null;
  target: string;
  category: string;
  severity: Severity; // the worst across its occurrences
  cvss: number | null; // the highest
  confirmed: boolean; // confirmed in at least one run
  remediation: string; // the worst occurrence's
  occurrences: Occurrence[]; // oldest run first
  runs: string[]; // the run ids it was seen in, each once
}

export interface ScopeSummary {
  status: string;
  approved: boolean;
  target: string;
  actions: string[];
  methods: string[];
  excluded: string[];
  ports: number[];
  tools: string[];
  timeLimitMinutes: number;
}

export type MissingData = "scope" | "plan" | "timing" | "findings";

/** One run's own section. */
export interface RunSection extends RunRef {
  details: { label: string; value: string }[];
  scope: ScopeSummary | null;
  plan: { done: number; total: number; steps: { label: string; status: "pending" | "active" | "done" }[] };
  findings: Occurrence[]; // the ones the report includes, worst first
  finished: boolean; // Completed: an empty findings list means it recorded none
  approvals: { approved: number; rejected: number; pending: number; total: number };
  blocked: number; // requests the policy engine refused
  requests: number;
  missing: MissingData[];
}

export interface Priority {
  rank: number;
  key: string; // the unique finding's
  title: string;
  severity: Severity;
  cvss: number | null;
  confirmed: boolean;
  runs: string[];
  target: string;
  remediation: string;
}

export interface Limitation {
  kind: "run" | "scope" | "plan" | "data" | "left-out";
  run: string | null; // the run id, when it concerns one run
  text: string;
}

export interface CombinedReport {
  title: string;
  options: CombineOptions;
  cover: {
    runs: RunRef[]; // oldest first
    from: string | null; // ISO: the earliest start
    to: string | null; // ISO: the latest end (or save, for a run that goes on)
    operators: string[];
    targets: string[];
    templates: string[];
    clients: string[];
  };
  summary: {
    runs: number;
    byStatus: { status: Status; count: number }[]; // only the statuses present
    occurrences: number;
    unique: number;
    uniqueBySeverity: Record<Severity, number>;
    occurrencesBySeverity: Record<Severity, number>;
    confirmed: number; // unique findings confirmed in at least one run
    scopesApproved: number; // runs whose Scope Manifest the operator approved
    worst: Severity | null;
    topRisks: UniqueFinding[]; // the first five priorities
    leftOut: { falsePositives: number; minor: number }; // findings not in this report
  };
  runs: RunSection[];
  findings: UniqueFinding[]; // worst first (severity, CVSS, occurrences, title)
  priorities: Priority[];
  limitations: Limitation[];
  appendix: {
    tools: { name: string; runs: string[] }[];
    references: { ref: string; count: number }[]; // over the included occurrences
    weaknesses: { cwe: string; count: number }[]; // over the unique findings
    uids: string[];
  } | null;
}

// --- identity ----------------------------------------------------------------------------

/** The title as the identity reads it: case, punctuation and spacing ignored. */
export const normaliseTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The finding's CWE: the first `cwe`, else the first `CWE-…` reference; null without one. */
export function cweOf(f: Pick<Finding, "cwe" | "references">): string | null {
  const found = f.cwe.find((c) => c.trim()) ?? f.references.find((r) => CWE.test(r.trim()));
  return found ? found.trim().toUpperCase() : null;
}

const targetOf = (f: Pick<Finding, "affected_url" | "path">) => (f.affected_url || f.path || "").trim();

/** What makes two findings of different runs the same finding. */
export const identityOf = (f: Pick<Finding, "title" | "cwe" | "references" | "affected_url" | "path">) =>
  `${normaliseTitle(f.title)}|${cweOf(f) ?? ""}|${targetOf(f).toLowerCase()}`;

// --- helpers -----------------------------------------------------------------------------

const runId = (a: Assessment) => a.assessment_id || a.label || a.uid;
const distinct = (items: string[]) => [...new Set(items.filter(Boolean))];
const parse = (iso: string | null | undefined) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

function runRef(a: Assessment): RunRef {
  return {
    uid: a.uid,
    id: runId(a),
    template: a.template.name || "—",
    target: a.target_url || a.target || "—",
    status: a.status,
    operator: a.operator || "—",
    client: a.client,
    startedAt: a.run.started_at,
    finishedAt: a.run.finished_at,
  };
}

function occurrence(a: Assessment, f: Finding, opts: CombineOptions): Occurrence {
  return {
    key: `${a.uid}~${f.id}`,
    uid: a.uid,
    runId: runId(a),
    id: f.id,
    title: f.title,
    severity: effectiveSeverity(f),
    cvss: f.cvss_score > 0 ? f.cvss_score : null,
    cvssVector: f.cvss_vector,
    validation: f.validation || "UNCONFIRMED",
    confirmed: isConfirmed(f),
    status: f.status || "open",
    tool: f.tool,
    target: targetOf(f),
    location: f.path,
    category: f.category,
    cwe: cweOf(f),
    references: distinct([...f.references, ...f.owasp, ...f.cve, ...f.cwe]),
    description: f.description,
    impact: f.impact,
    remediation: f.remediation,
    evidence: opts.evidence ? [...f.evidence] : [],
    note: f.triage_note,
  };
}

const byWorst = (x: Occurrence, y: Occurrence) =>
  sevRank(x.severity) - sevRank(y.severity) || (y.cvss ?? -1) - (x.cvss ?? -1) || x.id.localeCompare(y.id);

function scopeSummary(a: Assessment): ScopeSummary | null {
  const s = a.scope;
  if (!s) return null;
  return {
    status: s.status,
    approved: s.status === "APPROVED",
    target: s.target_url || a.target,
    actions: [...s.allowed_actions],
    methods: [...s.allowed_methods],
    excluded: [...s.excluded_paths],
    ports: [...s.allowed_ports],
    tools: [...s.tools],
    timeLimitMinutes: s.time_limit_minutes,
  };
}

function runSection(a: Assessment, findings: Occurrence[]): RunSection {
  const ref = runRef(a);
  const done = a.plan.filter((p) => p.status === "done").length;
  const decided = (d: "APPROVED" | "REJECTED") => a.decisions.filter((x) => x.decision === d).length;
  const pending = a.status === "Awaiting input" && a.waiting_request_id ? 1 : 0;
  const missing: MissingData[] = [];
  if (!a.scope) missing.push("scope");
  if (!a.plan.length) missing.push("plan");
  if (!a.run.started_at) missing.push("timing");
  if (!a.findings.length && a.status !== "Completed") missing.push("findings"); // a completed run may simply have found nothing
  const details: { label: string; value: string }[] = [
    { label: "Assessment", value: ref.id },
    { label: "Template", value: ref.template },
    { label: "Target", value: ref.target },
    { label: "Status", value: a.status },
    { label: "Operator", value: ref.operator },
  ];
  if (a.client) details.push({ label: "Client", value: a.client });
  details.push(
    { label: "Started", value: a.run.started_at ?? "not started" },
    { label: "Finished", value: a.run.finished_at ?? (a.run.started_at ? "not finished" : "—") },
    { label: "Requests sent", value: String(a.run.requests) },
    { label: "Plan", value: a.plan.length ? `${done} of ${a.plan.length} steps done` : "no plan saved" },
  );
  return {
    ...ref,
    details,
    scope: scopeSummary(a),
    plan: { done, total: a.plan.length, steps: a.plan.map((p) => ({ label: p.label, status: p.status })) },
    findings: [...findings].sort(byWorst),
    finished: a.status === "Completed",
    approvals: { approved: decided("APPROVED"), rejected: decided("REJECTED"), pending, total: a.approvals.length },
    blocked: a.verdicts.filter((v) => !v.allowed).length,
    requests: a.run.requests,
    missing,
  };
}

function uniqueFindings(occurrences: Occurrence[], identity: Map<string, string>): UniqueFinding[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = identity.get(o.key) as string;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const worst = [...list].sort(byWorst)[0];
      const scores = list.map((o) => o.cvss).filter((s): s is number => s !== null);
      return {
        key,
        title: list[0].title,
        cwe: list[0].cwe,
        target: list[0].target,
        category: worst.category || list.find((o) => o.category)?.category || "",
        severity: worst.severity,
        cvss: scores.length ? Math.max(...scores) : null,
        confirmed: list.some((o) => o.confirmed),
        remediation: worst.remediation,
        occurrences: list,
        runs: distinct(list.map((o) => o.runId)),
      };
    })
    .sort(
      (x, y) =>
        sevRank(x.severity) - sevRank(y.severity) ||
        (y.cvss ?? -1) - (x.cvss ?? -1) ||
        y.occurrences.length - x.occurrences.length ||
        x.title.localeCompare(y.title),
    );
}

/** "plan", "plan or timing", "plan, timing or findings". */
const listWords = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);

const RUN_LIMITS: Partial<Record<Status, string>> = {
  Interrupted: "was interrupted before it finished: its findings and coverage may be incomplete",
  Stopped: "was stopped by the operator before it finished: its findings and coverage may be incomplete",
  "Awaiting input": "is still waiting for a decision in the terminal: its testing has not finished",
  Running: "was still running when this report was built: its findings may change",
  New: "had not started testing: it contributes no coverage",
};

function limitations(list: Assessment[], sections: RunSection[], leftOut: { falsePositives: number; minor: number }, opts: CombineOptions): Limitation[] {
  const out: Limitation[] = [];
  for (const [i, a] of list.entries()) {
    const s = sections[i];
    const limit = RUN_LIMITS[a.status];
    if (limit) {
      const why = a.stopped_reason ? ` (${a.stopped_reason})` : "";
      out.push({ kind: "run", run: s.id, text: `${s.id} ${limit}${why}.` });
    }
    if (!a.scope) out.push({ kind: "scope", run: s.id, text: `${s.id} has no Scope Manifest saved: the boundary of its testing is not recorded.` });
    else if (a.scope.status !== "APPROVED") {
      out.push({ kind: "scope", run: s.id, text: `${s.id}'s scope was not approved (${a.scope.status}): testing could not start inside an approved boundary.` });
    }
    if (s.plan.total && s.plan.done < s.plan.total) {
      out.push({ kind: "plan", run: s.id, text: `${s.id} completed ${s.plan.done} of ${s.plan.total} plan steps.` });
    }
    const missing = s.missing.filter((m) => m !== "scope");
    if (missing.length) out.push({ kind: "data", run: s.id, text: `${s.id} has no ${listWords(missing)} saved.` });
  }
  if (leftOut.falsePositives) {
    const n = leftOut.falsePositives;
    out.push({ kind: "left-out", run: null, text: `${n} ${n === 1 ? "finding" : "findings"} marked as false positive ${n === 1 ? "was" : "were"} left out.` });
  }
  if (!opts.low) {
    const n = leftOut.minor;
    const count = n ? ` (${n} in these runs)` : "";
    out.push({ kind: "left-out", run: null, text: `LOW findings were left out by the report's options${count}.` });
  }
  if (!opts.evidence) out.push({ kind: "left-out", run: null, text: "Evidence lines were left out by the report's options." });
  if (!opts.appendix) out.push({ kind: "left-out", run: null, text: "The appendix (tools, references, run ids) was left out by the report's options." });
  return out;
}

function appendix(list: Assessment[], sections: RunSection[], unique: UniqueFinding[]): NonNullable<CombinedReport["appendix"]> {
  const tools = new Map<string, Set<string>>();
  for (const [i, a] of list.entries()) {
    const names = [...(a.scope?.tools ?? []), ...sections[i].findings.map((o) => o.tool)].filter(Boolean);
    for (const name of names) tools.set(name, (tools.get(name) ?? new Set()).add(sections[i].id));
  }
  const refs = new Map<string, number>();
  for (const u of unique) for (const o of u.occurrences) for (const r of o.references) refs.set(r, (refs.get(r) ?? 0) + 1);
  const cwes = new Map<string, number>();
  for (const u of unique) if (u.cwe) cwes.set(u.cwe, (cwes.get(u.cwe) ?? 0) + 1);
  const counted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    tools: [...tools.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, runs]) => ({ name, runs: [...runs] })),
    references: counted(refs).map(([ref, count]) => ({ ref, count })),
    weaknesses: counted(cwes).map(([cwe, count]) => ({ cwe, count })),
    uids: list.map((a) => a.uid),
  };
}

function bySeverity<T extends { severity: Severity }>(items: T[]): Record<Severity, number> {
  const out = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const item of items) out[item.severity] += 1;
  return out;
}

// --- the builder -------------------------------------------------------------------------

/** The combined report of `list` (any order; the report puts the oldest run first). */
export function combineAssessments(list: Assessment[], opts: CombineOptions): CombinedReport {
  const runs = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.uid.localeCompare(b.uid));
  const leftOut = { falsePositives: 0, minor: 0 };
  const identity = new Map<string, string>(); // occurrence key → unique key
  const perRun = runs.map((a) => {
    const kept: Occurrence[] = [];
    for (const f of a.findings) {
      if (isFalsePositive(f)) {
        leftOut.falsePositives += 1;
        continue;
      }
      const o = occurrence(a, f, opts);
      if (!opts.low && MINOR.has(o.severity)) {
        leftOut.minor += 1;
        continue;
      }
      identity.set(o.key, identityOf(f));
      kept.push(o);
    }
    return kept;
  });
  const occurrences = perRun.flat();
  const unique = uniqueFindings(occurrences, identity);
  const sections = runs.map((a, i) => runSection(a, perRun[i]));
  const priorities: Priority[] = unique.map((u, i) => ({
    rank: i + 1,
    key: u.key,
    title: u.title,
    severity: u.severity,
    cvss: u.cvss,
    confirmed: u.confirmed,
    runs: u.runs,
    target: u.target,
    remediation: u.remediation,
  }));
  const starts = runs.map((a) => parse(a.run.started_at) ?? parse(a.created_at)).filter((ms): ms is number => ms !== null);
  const ends = runs.map((a) => parse(a.run.finished_at) ?? parse(a.saved_at)).filter((ms): ms is number => ms !== null);
  const refs = runs.map(runRef);
  const byStatus = STATUSES.map((status) => ({ status, count: runs.filter((a) => a.status === status).length })).filter((s) => s.count);
  return {
    title: COMBINED_TITLE,
    options: { ...opts },
    cover: {
      runs: refs,
      from: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
      to: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
      operators: distinct(runs.map((a) => a.operator)),
      targets: distinct(refs.map((r) => r.target)),
      templates: distinct(runs.map((a) => a.template.name)),
      clients: distinct(runs.map((a) => a.client)),
    },
    summary: {
      runs: runs.length,
      byStatus,
      occurrences: occurrences.length,
      unique: unique.length,
      uniqueBySeverity: bySeverity(unique),
      occurrencesBySeverity: bySeverity(occurrences),
      confirmed: unique.filter((u) => u.confirmed).length,
      scopesApproved: runs.filter((a) => a.scope?.status === "APPROVED").length,
      worst: unique[0]?.severity ?? null,
      topRisks: unique.slice(0, 5),
      leftOut,
    },
    runs: sections,
    findings: unique,
    priorities,
    limitations: limitations(runs, sections, leftOut, opts),
    appendix: opts.appendix ? appendix(runs, sections, unique) : null,
  };
}
