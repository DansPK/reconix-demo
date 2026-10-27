/* The welcome screen's suggestions, built on the server from what the runs in scope hold: each
   one names real numbers (no suggestion about findings when there are none, no "what waits on
   me" when nothing waits), and its question is worded so the server shows the matching cards
   (intent.ts). Saved text in it is masked and cut as on the cards. Pure. */
import { RUN_STATUS, SEVERITY_META } from "../status";
import type { AssessmentView } from "../data/view-types";
import { cut, plural, rankFindings, safe, severityCounts, waitingOn, worstWords } from "./insights";

export type PromptKind = "findings" | "top" | "progress" | "approvals" | "report" | "plan";

export interface WelcomePrompt {
  kind: PromptKind;
  title: string; // what the card says
  detail: string; // the real numbers behind it
  question: string; // what is asked when it is picked
}

/** Suggestions for `views` (one run, or every run newest first). */
export function welcomePrompts(views: AssessmentView[]): WelcomePrompt[] {
  const one = views.length === 1 ? views[0] : null;
  const out: WelcomePrompt[] = [];
  const ranked = rankFindings(views);
  if (ranked.length) {
    const worst = worstWords(severityCounts(views));
    out.push({
      kind: "findings",
      title: "Analyze current findings",
      detail: `${plural(ranked.length, "finding")}${worst ? ` · ${worst}` : ""}`,
      question: "Analyze the current findings",
    });
    const top = ranked[0];
    out.push({
      kind: "top",
      title: "Explain the top finding",
      detail: `${cut(top.finding.id, 40)} · ${SEVERITY_META[top.finding.severity].label}${one ? "" : ` · ${cut(top.view.id, 80)}`}`,
      question: "Explain the top finding",
    });
  }
  if (views.length) {
    let detail: string;
    if (one) {
      const done = one.phases.filter((p) => p.status === "done").length;
      detail = `${one.progress}% · ${done} of ${plural(one.phases.length, "step")} done · ${RUN_STATUS[one.status].label}`;
    } else {
      const completed = views.filter((v) => v.status === "Completed").length;
      detail = `${completed} of ${plural(views.length, "run")} completed`;
    }
    out.push({ kind: "progress", title: "Review assessment progress", detail, question: "Review the assessment progress" });
  }
  const { approvals, inputs } = waitingOn(views);
  if (approvals || inputs.length) {
    const gate = one?.gate ? safe(one.gate.text, 160) : null; // masked and cut like the cards
    const runsWaiting = views.filter((v) => v.gate || v.approvals.some((a) => a.state === "PENDING")).length;
    out.push({
      kind: "approvals",
      title: "What waits on my approval?",
      detail: gate ?? `${plural(runsWaiting, "run")} ${runsWaiting === 1 ? "waits" : "wait"} on you`,
      question: "What waits on my approval?",
    });
  }
  if (views.length) {
    out.push({
      kind: "report",
      title: "Generate a report",
      detail: one ? "PDF, JSON or DOCX" : "Pick a run, then download",
      question: "Generate a report",
    });
  }
  out.push({ kind: "plan", title: "Plan a security assessment", detail: "Planning happens in the TUI", question: "Plan a security assessment" });
  return out;
}
