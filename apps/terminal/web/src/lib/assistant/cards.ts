/* The cards a reply shows, picked from the question with fixed rules (intent.ts) and built from
   the saved files only: findings, plan progress, approvals (each recorded decision), policy blocks
   (each with its reason), tool steps, report downloads, and notices for what the assistant can't
   do or what the data doesn't hold (errors). The model never writes these; it
   only explains around them, so a finding, a count or a state on a card is always the saved
   one. Free text from the files is masked again (redact.ts) and cut to one line. Nothing here
   runs, approves or changes anything. Pure: the route calls it, and the unit tests drive it on
   the sample data. */
import { assessmentView } from "../data/adapt";
import { clock, parseTime } from "../data/format";
import type { Assessment } from "../data/schema";
import type { AssessmentView, FindingView } from "../data/view-types";
import { cut, type Located, rankFindings, reviewOf, runRef, safe, scopedViews, severityCounts, waitingOn } from "./insights";
import { findingKey, readIntent } from "./intent";
import { type Card, type CardOf, CardSchema, type FindingItem, MAX_CARDS } from "./protocol";

const FINDINGS_SHOWN = 5;
const RUNS_SHOWN = 8;
const TOOL_RUNS_SHOWN = 6;
const STEPS_SHOWN = 10;
const APPROVALS_SHOWN = 6;
const BLOCKS_SHOWN = 8;

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// --- notices -------------------------------------------------------------------------------

export const NOTICES = {
  plan: {
    kind: "notice",
    tone: "info",
    title: "Plan a new assessment in the TUI",
    body: "The assistant can't plan, create or start an assessment, and no plan has been made. Planning happens in the Reconix TUI, with your approval at each gate.",
    steps: [
      "Run python -m reconix in the reconix-tui folder.",
      "Enter the target and pick a template.",
      "Review and approve the Scope Manifest.",
      "Review the plan and run it; risky steps wait for your approval.",
    ],
    action: null,
  },
  run: {
    kind: "notice",
    tone: "warning",
    title: "Nothing runs from the dashboard",
    body: "Scans and tools run only in the Reconix TUI, inside the approved scope and after your approval. This chat reads saved results.",
    steps: [],
    action: null,
  },
  act: {
    kind: "notice",
    tone: "warning",
    title: "Approvals are given in the TUI only",
    body: "The assistant can't approve or reject an action. Decide in the TUI, where a HIGH-risk action needs a double check.",
    steps: [],
    action: null,
  },
  empty: {
    kind: "notice",
    tone: "info",
    title: "No saved assessments yet",
    body: "Run an assessment in the Reconix TUI: it is saved here as it goes, and the assistant can then answer about it.",
    steps: [],
    action: null,
  },
  // "the data doesn't contain that": the saved files hold no error log and no failed state
  errors: {
    kind: "notice",
    tone: "info",
    title: "The saved data records no errors",
    body: "A saved run holds its activity log, policy checks, approvals and findings, and a state: not started, running, waiting for you, completed, stopped or interrupted. It has no error log and no failed state, so the assistant can't report one.",
    steps: ["The progress card below shows each run's real state.", "A run that ended early is Stopped (by you) or Interrupted (the TUI closed)."],
    action: null,
  },
} satisfies Record<string, CardOf<"notice">>;

// --- builders ------------------------------------------------------------------------------

function findingItem(f: FindingView, v: AssessmentView): FindingItem {
  return {
    id: cut(f.id, 120),
    title: safe(f.title, 400),
    severity: f.severity,
    cvss: f.score === null ? null : Math.max(0, Math.min(10, f.score)),
    target: safe(f.target, 400),
    review: reviewOf(f),
    run: runRef(v),
  };
}

export function findingsCard(views: AssessmentView[]): CardOf<"findings"> {
  const ranked = rankFindings(views);
  return {
    kind: "findings",
    total: ranked.length,
    counts: severityCounts(views),
    items: ranked.slice(0, FINDINGS_SHOWN).map(({ finding, view }) => findingItem(finding, view)),
    runs: new Set(ranked.map((r) => r.view.uid)).size,
  };
}

export function findingCard({ finding: f, view }: Located): CardOf<"finding"> {
  return {
    kind: "finding",
    item: findingItem(f, view),
    cwe: cut(f.cwe, 120),
    tool: cut(f.tool, 120),
    description: safe(f.description, 1_200),
    impact: safe(f.impact, 800),
    remediation: f.remediation.slice(0, 6).map((r) => safe(r, 400)),
  };
}

export function progressCard(views: AssessmentView[]): CardOf<"progress"> {
  return {
    kind: "progress",
    runs: views.slice(0, RUNS_SHOWN).map((v) => ({
      run: runRef(v),
      status: v.status,
      progress: pct(v.progress),
      phases: v.phases.slice(0, 12).map((p) => ({ label: cut(p.label, 120), status: p.status, pct: pct(p.pct) })),
    })),
    more: Math.max(0, views.length - RUNS_SHOWN),
  };
}

export const STATE_ORDER = ["PENDING", "NOT REACHED", "APPROVED", "REJECTED"] as const;

export function approvalsCard(views: AssessmentView[]): CardOf<"approvals"> {
  const all = views
    .flatMap((v, i) => v.approvals.map((a) => ({ a, v, i })))
    .sort((x, y) => STATE_ORDER.indexOf(x.a.state) - STATE_ORDER.indexOf(y.a.state) || x.i - y.i);
  const { approvals, inputs } = waitingOn(views);
  const counts = { APPROVED: 0, REJECTED: 0, PENDING: 0, "NOT REACHED": 0 };
  for (const { a } of all) counts[a.state] += 1;
  return {
    kind: "approvals",
    items: all.slice(0, APPROVALS_SHOWN).map(({ a, v }) => ({
      run: runRef(v),
      id: cut(a.id, 120),
      action: safe(a.action, 120),
      risk: safe(a.risk, 120),
      target: safe(a.target, 400),
      state: a.state,
    })),
    waiting: inputs.slice(0, RUNS_SHOWN).map((v) => ({ run: runRef(v), text: safe(v.gate?.text ?? "", 400) })),
    pending: approvals,
    counts,
    more: Math.max(0, all.length - APPROVALS_SHOWN),
  };
}

export function policyCard(runs: { a: Assessment; v: AssessmentView }[]): CardOf<"policy"> {
  const blocked = runs.flatMap(({ a, v }) =>
    a.verdicts
      .filter((x) => !x.allowed)
      .map((x) => {
        const at = parseTime(x.at);
        return {
          run: runRef(v),
          time: at === null ? "—" : clock(at),
          text: safe(`${x.method} ${x.path} · ${x.reason}`, 400),
          method: safe(x.method, 120),
          path: safe(x.path, 400),
          reason: safe(x.reason, 400),
        };
      }),
  );
  return {
    kind: "policy",
    checks: runs.reduce((n, { a }) => n + a.verdicts.length, 0),
    blocked: blocked.length,
    items: blocked.slice(0, BLOCKS_SHOWN),
    more: Math.max(0, blocked.length - BLOCKS_SHOWN),
  };
}

/** The tool a log line is about: one of the approved scope's tools it names, else "—". */
function toolOf(text: string, tools: string[]): string {
  const lower = text.toLowerCase();
  const named = [...tools].sort((a, b) => b.length - a.length).find((t) => t && lower.includes(t.toLowerCase()));
  return named ? safe(named, 120) : "—";
}

export function toolsCard(views: AssessmentView[]): CardOf<"tools"> {
  return {
    kind: "tools",
    runs: views.slice(0, TOOL_RUNS_SHOWN).map((v) => {
      const lines = v.log.filter((l) => l.kind === "tool");
      return {
        run: runRef(v),
        steps: lines.slice(0, STEPS_SHOWN).map((l) => ({ time: cut(l.t, 120), tool: toolOf(l.text, v.scope?.tools ?? []), text: safe(l.text, 400) })),
        total: lines.length,
        requests: Math.max(0, v.requests),
      };
    }),
    more: Math.max(0, views.length - TOOL_RUNS_SHOWN),
  };
}

/** The shown tool steps grouped by tool, most steps first ("—" for lines that name no tool,
    last). A reading of the card's own rows: it counts the steps shown, not the run's total. */
export function toolGroups(steps: { tool: string }[]): { tool: string; steps: number }[] {
  const counts = new Map<string, number>();
  for (const s of steps) counts.set(s.tool, (counts.get(s.tool) ?? 0) + 1);
  return [...counts]
    .map(([tool, steps]) => ({ tool, steps }))
    .sort((a, b) => (a.tool === "—" ? 1 : 0) - (b.tool === "—" ? 1 : 0) || b.steps - a.steps || a.tool.localeCompare(b.tool));
}

export function reportCard(views: AssessmentView[]): CardOf<"report"> {
  return {
    kind: "report",
    runs: views.slice(0, RUNS_SHOWN).map((v) => ({ run: runRef(v), status: v.status })),
    more: Math.max(0, views.length - RUNS_SHOWN),
  };
}

// --- picking -------------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The cards for `question` about one saved run (`uid`) or every run (null), in the order they
    are shown, at most MAX_CARDS. Every card passes CardSchema (anything else is dropped). */
export function pickCards(library: Assessment[], uid: string | null, question: string): Card[] {
  const { intents, findingIds } = readIntent(question);
  const pairs = library.map((a) => ({ a, v: assessmentView(a) }));
  const byUid = new Map(pairs.map((p) => [p.v.uid, p]));
  let views = scopedViews(
    pairs.map((p) => p.v),
    uid,
  );
  // about every run, a question that names runs ("RCX-DEMO-002") is about those
  if (!uid) {
    const named = views.filter((v) => v.id && new RegExp(`(?<![\\w-])${escape(v.id)}(?![\\w-])`, "i").test(question));
    if (named.length) views = named;
  }
  const has = (i: (typeof intents)[number]) => intents.includes(i);
  const cards: Card[] = [];
  if (!views.length) return uid ? [] : has("plan") ? [NOTICES.plan] : intents.length ? [NOTICES.empty] : [];

  if (has("plan")) return [NOTICES.plan];
  if (has("run")) cards.push(NOTICES.run);
  if (has("act")) cards.push(NOTICES.act);
  if (has("errors")) cards.push(NOTICES.errors); // the data has none: say so first

  // findings named by id (false positives too: the operator asked for them), then the top one
  const named: Located[] = [];
  for (const key of findingIds) {
    for (const v of views) {
      const f = v.findings.find((x) => findingKey(x.id) === key);
      if (f && named.length < 2) named.push({ finding: f, view: v });
    }
  }
  for (const located of named) cards.push(findingCard(located));
  if (!named.length && has("top")) {
    const top = rankFindings(views)[0];
    if (top) cards.push(findingCard(top));
  }
  const detailShown = cards.some((c) => c.kind === "finding");
  if (has("findings") && !(detailShown && !/\bfindings\b/i.test(question))) cards.push(findingsCard(views));
  if (!has("findings") && has("top") && !detailShown) cards.push(findingsCard(views)); // nothing to explain: say so
  if (has("approvals")) cards.push(approvalsCard(views));
  if (has("progress")) cards.push(progressCard(views));
  if (has("tools")) cards.push(toolsCard(views));
  if (has("policy")) cards.push(policyCard(views.map((v) => byUid.get(v.uid)!).filter(Boolean)));
  if (has("report")) cards.push(reportCard(views));
  if (has("errors") && !has("progress")) cards.push(progressCard(views)); // the runs' real states

  return cards.filter((c) => CardSchema.safeParse(c).success).slice(0, MAX_CARDS);
}

/** What the model is told about the cards shown with its answer (no data, only their kinds). */
export function cardNotes(cards: Card[]): string[] {
  const words: Record<Card["kind"], string> = {
    findings: "a findings card (severity counts and the worst findings)",
    finding: "a finding card (one finding's severity, CVSS, target, description and remediation)",
    progress: "a progress card (each plan phase and its state)",
    approvals: "an approvals card (each gated action and whether it was approved)",
    policy: "a policy card (requests blocked by the approved scope)",
    tools: "a tools card (the tool steps from the activity log)",
    report: "a report card (download links)",
    notice: "a notice about what the assistant cannot do",
  };
  return [...new Set(cards.map((c) => words[c.kind]))];
}

