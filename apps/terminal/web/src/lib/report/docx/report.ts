/* One saved assessment as an editable Word report: the same five sections as the PDF
   (../html.ts) — executive summary, findings summary, approved scope and limitations, detailed
   findings, policy and governance — from the same saved, masked data. The route masks the
   assessment once more before it gets here (lib/report/mask.ts). */
import "server-only";

import {
  type Assessment,
  type Finding,
  FINDING_SEVERITIES as ALL_SEVERITIES,
  SEVERITIES,
} from "@/lib/data/schema";

import { counts, percents, sevRank, shortDate, title, validationLine } from "../html";
import {
  categoryLabel,
  findingCategory,
  identifiersForReport,
  isClassifiedFinding,
  isRatedSecurityFinding,
  originalRatingClaim,
  ratedSecurityCount,
  reportCounts,
  scoreForReport,
  severityForReport,
  vectorForReport,
} from "../counts";
import { type Block, docxFile } from "./ooxml";

const cvss = (f: Finding) => {
  const score = scoreForReport(f);
  if (score === null) return "—";
  const rating = score.toFixed(1);
  return isClassifiedFinding(f) ? rating : `Claim ${rating}`;
};
const STATUS: Record<string, string> = { open: "Open", fixed: "Fixed", accepted: "Accepted", "false-positive": "False positive" };
const statusOf = (s: string) => (Object.hasOwn(STATUS, s || "open") ? STATUS[s || "open"] : s);

function engagementWindow(a: Assessment): string {
  const start = shortDate(a.run.started_at);
  const end = shortDate(a.run.finished_at);
  if (start === "—" && end === "—") return "Time-boxed";
  return start === end ? start : `${start} → ${end}`;
}

/** Rated security findings per severity, worst first, only the severities present. */
function severityLine(findings: Finding[]): string {
  const counts = reportCounts(findings).severity_counts;
  return SEVERITIES.filter((severity) => counts[severity])
    .map((severity) => `${counts[severity]} ${title(severity)}`)
    .join(", ") || "no rated security findings";
}

function categoryLine(findings: Finding[]): string {
  const categories = reportCounts(findings).category_counts;
  return Object.entries(categories)
    .filter(([, count]) => count)
    .map(([category, count]) => `${count} ${categoryLabel(category as keyof typeof categories)}`)
    .join(" · ") || "none";
}

function findingBlocks(f: Finding): Block[] {
  const isClassified = isClassifiedFinding(f);
  const severity = severityForReport(f);
  const score = scoreForReport(f);
  const vector = vectorForReport(f);
  const identifiers = identifiersForReport(f);
  const ev = f.effective_verification;
  let validationDisplay: string;
  if (ev) {
    if (ev.legacy) validationDisplay = "legacy, not verified";
    else if (ev.status === "VERIFIED") {
      const subject = ev.subject;
      const subjectLabel =
        subject && typeof subject === "object" && typeof (subject as Record<string, unknown>).label === "string"
          ? ((subject as Record<string, unknown>).label as string)
          : undefined;
      const base = `Verified by ${(ev.verifier || f.tool || "VALIDATION").toUpperCase()}`;
      validationDisplay = subjectLabel ? `${base} (${subjectLabel})` : base;
    } else if (ev.status === "NOT_REPRODUCED") {
      const subject = ev.subject;
      const subjectLabel =
        subject && typeof subject === "object" && typeof (subject as Record<string, unknown>).label === "string"
          ? ((subject as Record<string, unknown>).label as string)
          : undefined;
      const base = `Not reproduced by ${(ev.verifier || f.tool || "VALIDATION").toUpperCase()}`;
      validationDisplay = subjectLabel ? `${base} (${subjectLabel})` : base;
    } else if (ev.status === "INCONCLUSIVE") validationDisplay = ev.reason ? `Inconclusive: ${ev.reason}` : "Inconclusive";
    else if (ev.status === "DEFERRED") validationDisplay = ev.reason ? `Deferred: ${ev.reason}` : "Deferred";
    else if (ev.status === "UNVERIFIED") validationDisplay = "Unverified";
    else if (ev.status) validationDisplay = title(ev.status);
    else if (
      f.validation?.toUpperCase() === "CONFIRMED" ||
      (isClassified && findingCategory(f) === "CONFIRMED_VULNERABILITY") ||
      f.verification_status === "CONFIRMED"
    ) {
      validationDisplay = "legacy, not verified";
    } else {
      validationDisplay = title(f.validation);
    }
  } else if (
    f.validation?.toUpperCase() === "CONFIRMED" ||
    (isClassified && findingCategory(f) === "CONFIRMED_VULNERABILITY") ||
    f.verification_status === "CONFIRMED"
  ) {
    validationDisplay = "legacy, not verified";
  } else {
    validationDisplay = title(f.validation);
  }
  const rows: [string, string][] = [
    ["Validated severity", severity],
    ["Validation", validationDisplay],
    ["Status", statusOf(f.status)],
    ["Affected asset", f.affected_url || "—"],
    ["Location", f.path || "—"],
    ["Finding category", categoryLabel(findingCategory(f))],
    ["Confidence", f.confidence_level || "UNKNOWN"],
    ["Evidence quality", f.evidence_quality || "UNKNOWN"],
    ["Verification", f.verification_status || "UNKNOWN"],
    ["Exploitability", f.exploitability || "UNKNOWN"],
    ["Detected by", f.tool || "—"],
    [isClassified ? "Validated identifiers" : "Scanner identifier claims (unvalidated)", identifiers.join(", ") || "—"],
  ];
  if (!isClassified) rows.push(["Original rating (scanner/legacy claim; unvalidated)", originalRatingClaim(f)]);
  if (score !== null) rows.push([isClassified ? "Validated CVSS" : "Scanner CVSS claim (unvalidated)", score.toFixed(1)]);
  if (vector) rows.push([isClassified ? "Validated CVSS vector" : "Scanner CVSS vector claim (unvalidated)", vector]);
  if (f.classification_uncertainty) rows.push(["Uncertainty", f.classification_uncertainty]);
  const out: Block[] = [
    { kind: "heading", level: 2, text: `${f.id} · ${f.title}` },
    { kind: "kv", rows },
    { kind: "heading", level: 3, text: "Description" },
    { kind: "para", runs: [f.description || "—"] },
  ];
  const aiNotes = f.ai_notes;
  if (aiNotes && (aiNotes.explanation || aiNotes.impact || aiNotes.remediation || aiNotes.uncertainty)) {
    out.push({ kind: "heading", level: 3, text: "AI assessment (not verified)" });
    if (aiNotes.explanation) out.push({ kind: "para", runs: [aiNotes.explanation] });
    if (aiNotes.impact) out.push({ kind: "para", runs: [{ text: "Impact: ", bold: true }, aiNotes.impact] });
    if (aiNotes.remediation) out.push({ kind: "para", runs: [{ text: "Remediation: ", bold: true }, aiNotes.remediation] });
    if (aiNotes.uncertainty) out.push({ kind: "para", runs: [{ text: "Uncertainty: ", bold: true }, aiNotes.uncertainty] });
  }
  out.push({ kind: "heading", level: 3, text: "Evidence & validation (masked)" });
  if (f.evidence_summary) out.push({ kind: "para", runs: [f.evidence_summary] });
  const valLine = validationLine(f);
  if (valLine) out.push({ kind: "para", runs: [valLine] });
  out.push(
    { kind: "pre", lines: f.evidence },
    { kind: "heading", level: 3, text: "Impact" },
    { kind: "para", runs: [f.impact || "—"] },
    { kind: "heading", level: 3, text: "Remediation" },
    { kind: "para", runs: [f.remediation || "—"] },
  );
  if (f.source_claims?.length) {
    out.push({ kind: "para", runs: [{ text: "Original scanner claims (unvalidated): ", bold: true }, f.source_claims.join("\n")] });
  }
  if (f.review_history?.length) {
    out.push({ kind: "para", runs: [{ text: "Analyst review history: ", bold: true }, f.review_history.join("\n")] });
  }
  if (identifiers.length) {
    out.push({
      kind: "para",
      runs: [{ text: isClassified ? "References: " : "Scanner reference claims (unvalidated): ", bold: true }, identifiers.join(", ")],
    });
  }
  if (f.triage_note) out.push({ kind: "para", runs: [{ text: "Analyst note: ", bold: true }, f.triage_note] });
  return out;
}

/** The report's blocks, in the PDF's order. */
function reportBlocks(a: Assessment, now: Date = new Date()): Block[] {
  const generated = now.toISOString();
  const findings = [...a.findings].sort((x, y) => sevRank(severityForReport(x)) - sevRank(severityForReport(y)) || x.id.localeCompare(y.id));
  const blocked = a.verdicts.filter((v) => !v.allowed);
  const approved = a.decisions.filter((d) => d.decision === "APPROVED").length;
  const totals = reportCounts(findings);
  const ratedSeverityCounts = totals.severity_counts;
  const ratedTotal = ratedSecurityCount(ratedSeverityCounts);
  const highest = SEVERITIES.find((severity) => ratedSeverityCounts[severity]) ?? "not rated";
  const lead = findings.find((f) => isRatedSecurityFinding(f) && severityForReport(f) === highest);
  const c = counts(findings);
  const pct = percents(c);
  const spread = ALL_SEVERITIES.filter((sv) => c[sv]).map((sv) => `${c[sv]} ${title(sv)} (${pct[sv]}%)`);
  const s = a.scope;
  return [
    { kind: "title", text: "Security Assessment Report" },
    { kind: "subtitle", text: `AI-Assisted Authorized Penetration Test — ${a.template.name || "Security assessment"}` },
    {
      kind: "kv",
      rows: [
        ["Target", a.target_url || a.target || "—"],
        ["Client", a.client || "—"],
        ["Engagement ID", a.assessment_id || a.label || "—"],
        ["Assessment window", engagementWindow(a)],
        ["Report date", shortDate(generated)],
        ["Assessment type", a.mode || "—"],
        ["Report version", `${a.report_version || "1.0"} — Final`],
      ],
    },
    { kind: "para", runs: [{ text: "CONFIDENTIAL — AUTHORIZED RECIPIENTS ONLY", bold: true }] },
    {
      kind: "para",
      note: true,
      runs: ["Generated by Reconix. AI-guided assessment; the policy engine, approvals and vault are deterministic. Credentials and one-time codes are never stored or shown, and evidence is masked at the source."],
    },
    { kind: "heading", level: 1, text: "1 Executive summary" },
    {
      kind: "para",
      runs: [
        `Reconix performed an authorized assessment of ${a.target_url || a.target || "the target"} (${a.template.name || "assessment"}). ` +
          `It recorded ${findings.length} finding(s). Vulnerability counts: ${totals.vulnerability_counts.CONFIRMED_VULNERABILITY} confirmed · ` +
          `${totals.vulnerability_counts.POTENTIAL_VULNERABILITY} potential. Findings by category: ${categoryLine(findings)}. ` +
          `Severity totals cover ${ratedTotal} rated security finding(s) — ${severityLine(findings)}. The highest rated severity is ${title(highest)}` +
          `${lead ? `, led by ${lead.title}` : ""}. ${blocked.length} out-of-scope request(s) were blocked by policy and ` +
          `${approved} gated action(s) were approved by a human. Intrusive actions ran only after explicit, single-use approval.`,
      ],
    },
    {
      kind: "table",
      head: [...ALL_SEVERITIES.map(title), "Total"],
      rows: [[...ALL_SEVERITIES.map((sv) => String(c[sv])), String(findings.length)]],
    },
    ...(spread.length ? [{ kind: "para" as const, runs: [`Severity distribution: ${spread.join(" · ")}`] }] : []),
    { kind: "heading", level: 1, text: "2 Findings summary" },
    {
      kind: "table",
      head: ["ID", "Finding", "Validated severity", "CVSS", "Status", "Category"],
      rows: findings.map((f) => [f.id, f.title, title(severityForReport(f)), cvss(f), statusOf(f.status), categoryLabel(findingCategory(f))]),
      weights: [1.4, 5, 1.6, 1.1, 1.7, 2.6], // the title takes the widest share
      empty: "No findings were recorded.",
    },
    { kind: "heading", level: 1, text: "3 Approved scope & limitations" },
    {
      kind: "kv",
      rows: [
        ["Approval status", s?.status === "APPROVED" ? "Approved" : "Not approved"],
        ["Standards", a.methodology.join(" · ") || "—"],
        ["Allowed actions", (s?.allowed_actions ?? []).join(", ") || "—"],
        ["Allowed methods", (s?.allowed_methods ?? []).join(", ") || "—"],
        ["Excluded paths", (s?.excluded_paths ?? []).join(", ") || "none"],
        ["Time limit", `${s?.time_limit_minutes ?? 0} minutes`],
        ["Tools", (s?.tools ?? []).join(", ") || "—"],
      ],
    },
    {
      kind: "para",
      note: true,
      runs: ["Testing was limited to the approved actions, methods and time window. Requests to an excluded path or outside the allowed methods were refused by the policy engine rather than sent. Findings reflect only what was observed under these constraints."],
    },
    { kind: "pagebreak" },
    { kind: "heading", level: 1, text: "4 Detailed findings" },
    ...(findings.length ? findings.flatMap(findingBlocks) : [{ kind: "para", note: true, runs: ["No findings."] } as Block]),
    { kind: "heading", level: 1, text: "5 Policy & governance" },
    { kind: "heading", level: 3, text: `Blocked by policy · ${blocked.length}` },
    { kind: "table", head: ["Request", "Reason"], rows: blocked.map((v) => [`${v.method} ${v.path}`, v.reason]), empty: "No requests were blocked." },
    { kind: "heading", level: 3, text: `Human approvals · ${a.decisions.length}` },
    {
      kind: "table",
      head: ["Risk", "Action", "Target", "Decision", "Analyst"],
      rows: a.decisions.map((d) => {
        const req = a.approvals.find((p) => p.request_id === d.request_id);
        return [title(req?.risk ?? "INFO"), req?.action ?? d.request_id, req?.target ?? "", title(d.decision), d.operator || "—"];
      }),
      empty: "No gated actions were required.",
    },
    { kind: "para", note: true, runs: [`Reconix — Confidential · ${a.assessment_id || a.label || "—"} · End of report`] },
  ];
}

/** The Word report of one saved (and masked) assessment. */
export function renderReportDocx(a: Assessment, now: Date = new Date()): Uint8Array<ArrayBuffer> {
  return docxFile(reportBlocks(a, now), { title: `Reconix Report — ${a.assessment_id || a.label || a.uid}`, created: now.toISOString() });
}
