/* Small facts about the saved runs that both the welcome screen's suggestions (prompts.ts) and
   the reply cards (cards.ts) use, so a suggestion and the card it leads to always agree (the
   "top finding" a suggestion names is the one its card explains). Pure. */
import { hourMinute, shortDay } from "../data/format";
import { SEVERITIES, type Severity } from "../data/schema";
import type { AssessmentView, FindingView } from "../data/view-types";
import type { RunRef, ScopeRef } from "./protocol";
import { redact } from "./redact";

/** Worst first: the schema's four levels (lib/data/schema.ts). */
export const SEVERITY_ORDER: readonly Severity[] = SEVERITIES;
const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);

/** A run as card rows name it: its label and when it was created ("5 Oct 14:03"). */
export function runRef(v: AssessmentView): RunRef {
  return { uid: v.uid, label: cut(v.id, 120), when: `${shortDay(v.createdMs)} ${hourMinute(v.createdMs)}` };
}

/** What a conversation about one run (or every run) is about, as its header names it: the
    whole label (id and date) within the protocol's 120 characters. */
export function scopeOf(v: AssessmentView | null): ScopeRef {
  if (!v) return { uid: null, label: "All assessments" };
  const ref = runRef(v);
  return { uid: ref.uid, label: cut(`${ref.label} · ${ref.when}`, 120) };
}

/** One line of text, cut to `max` characters. */
export function cut(value: unknown, max: number): string {
  const flat = String(value ?? "")
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Saved free text shown to the operator: masked again (redact.ts) and made one line. */
export const safe = (value: unknown, max: number) => cut(redact(String(value ?? "")), max);

/** The runs a question is about: one run, or every run (newest first). */
export function scopedViews(views: AssessmentView[], uid: string | null): AssessmentView[] {
  const sorted = [...views].sort((a, b) => b.createdMs - a.createdMs || b.uid.localeCompare(a.uid));
  return uid ? sorted.filter((v) => v.uid === uid) : sorted;
}

/** Findings that count (false positives are left out, as on the dashboard). */
export const realFindings = (v: AssessmentView) => v.findings.filter((f) => !f.falsePositive);

export type Located = { finding: FindingView; view: AssessmentView };

/** Worst first: severity, then CVSS, then the newer run, then the id. */
export function rankFindings(views: AssessmentView[]): Located[] {
  const order = new Map(views.map((v, i) => [v.uid, i]));
  return views
    .flatMap((view) => realFindings(view).map((finding) => ({ finding, view })))
    .sort(
      (a, b) =>
        rank(a.finding.severity) - rank(b.finding.severity) ||
        (b.finding.score ?? 0) - (a.finding.score ?? 0) ||
        (order.get(a.view.uid) ?? 0) - (order.get(b.view.uid) ?? 0) ||
        a.finding.id.localeCompare(b.finding.id),
    );
}

// Weakness words mapped from a finding's CWE, so "the XSS" or "the IDOR" opens that finding even
// when its title never spells the acronym ("Reflected input in search page" is CWE-79). A one-word
// term is matched as a whole word (so "tls" never matches "details"); a phrase, as a substring.
const WEAKNESS_TERMS: Record<string, readonly string[]> = {
  "CWE-79": ["xss", "cross-site scripting", "reflected input", "reflected", "script injection"],
  "CWE-89": ["sqli", "sql injection", "sql", "union select"],
  "CWE-639": ["idor", "object-level", "broken object", "direct object", "order records"],
  "CWE-285": ["authorization", "authorisation", "access control", "export endpoint"],
  "CWE-284": ["access control", "management console", "admin console"],
  "CWE-798": ["hardcoded", "hard-coded", "secret", "credential", "api key", "database password"],
  "CWE-307": ["brute force", "brute-force", "rate limit", "rate-limiting"],
  "CWE-327": ["tls", "ssl", "cipher", "weak hash", "md5", "deprecated tls"],
  "CWE-1104": ["dependency", "dependencies", "outdated", "component", "cve"],
  "CWE-1321": ["prototype pollution", "dependency", "outdated javascript", "cve"],
  "CWE-1275": ["samesite", "session cookie", "cookie"],
  "CWE-200": ["information disclosure", "banner", "version disclosure"],
};

// Stop-words plus the question's own furniture, so matching keys off the weakness, not "finding".
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "this", "that", "it", "is", "are",
  "was", "were", "about", "tell", "me", "what", "which", "show", "explain", "any", "there", "did",
  "you", "reconix", "finding", "findings", "vulnerability", "vulnerabilities", "issue", "issues",
  "page", "with", "how", "why", "can", "does",
]);

function questionTokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t)));
}

/** Findings a question names by its weakness (acronym/phrase from the CWE) or by its title words,
    best first and distinct, so a question about one weakness opens that finding instead of the
    worst one again. Empty when the question names no particular weakness (then the caller lists). */
export function matchFindings(views: AssessmentView[], question: string, limit = 2): Located[] {
  const q = question.toLowerCase();
  const qTokens = questionTokens(question);
  const hit = (term: string) => (term.includes(" ") ? q.includes(term) : qTokens.has(term));
  const scored: { loc: Located; score: number }[] = [];
  for (const view of views) {
    for (const finding of realFindings(view)) {
      let score = 0;
      for (const cwe of String(finding.cwe ?? "").toUpperCase().match(/CWE-\d+/g) ?? []) {
        if (q.includes(cwe.toLowerCase())) score += 3;
        for (const term of WEAKNESS_TERMS[cwe] ?? []) if (hit(term)) score += 3;
      }
      for (const t of questionTokens(finding.title)) if (qTokens.has(t)) score += 1;
      if (score > 0) scored.push({ loc: { finding, view }, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || rank(a.loc.finding.severity) - rank(b.loc.finding.severity));
  const out: Located[] = [];
  const seen = new Set<string>();
  for (const { loc, score } of scored) {
    if (score < 2) continue; // one stray title word isn't enough; a weakness term or two words is
    const key = `${loc.view.uid}|${loc.finding.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
    if (out.length >= limit) break;
  }
  return out;
}

export function severityCounts(views: AssessmentView[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const v of views) for (const f of realFindings(v)) counts[f.severity] += 1;
  return counts;
}

/** "2 critical, 12 high" (the two worst levels present), or "". */
export function worstWords(counts: Record<Severity, number>): string {
  return SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .slice(0, 2)
    .map((s) => `${counts[s]} ${s.toLowerCase()}`)
    .join(", ");
}

export const reviewOf = (f: FindingView): "confirmed" | "review" | "closed" => (f.confirmed ? "confirmed" : f.needsReview ? "review" : "closed");

/** Approvals that wait on the operator now, and runs paused on another input (a sign-in). */
export function waitingOn(views: AssessmentView[]): { approvals: number; inputs: AssessmentView[] } {
  let approvals = 0;
  const inputs: AssessmentView[] = [];
  for (const v of views) {
    const pending = v.approvals.filter((a) => a.state === "PENDING").length;
    approvals += pending;
    if (!pending && v.gate) inputs.push(v);
  }
  return { approvals, inputs };
}

// Its own small copy: the dashboard's (components/dashboard/derive.ts) isn't exported, and lib
// code doesn't import from components.
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
