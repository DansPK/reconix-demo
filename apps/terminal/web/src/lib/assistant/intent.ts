/* What a question asks for, read from its words with fixed rules (no model): the server picks
   the reply's cards from this (cards.ts), so the same question always gets the same verified
   cards. Pure. */

export type Intent =
  | "plan" // plan or start a new assessment: guidance only (planning happens in the TUI)
  | "run" // run a scan or a tool: nothing runs from the dashboard
  | "act" // approve or reject: only ever in the TUI
  | "top" // the finding to fix first
  | "findings"
  | "approvals"
  | "progress"
  | "tools"
  | "policy"
  | "report"
  | "errors"; // errors, failures, crashes: the saved data records none (a notice says so)

export interface Asked {
  intents: Intent[];
  findingIds: string[]; // finding ids named in the question, as findingKey() spells them
}

// planning: a planning verb right before its object ("plan a security assessment", "start a
// scan"), or new/another right before the noun ("a new assessment"). Never "new" alone, so
// "which findings are new in this assessment?" is about findings.
const KINDS = "(?:security |web |api |network |source code )?";
const NOUN = "(?:assessments?|pentests?|penetration tests?|security tests?|engagements?|scans?|tests?|runs?)";
const PLAN = new RegExp(
  `\\b(?:plan|design|prepare|set ?up|create|start|begin|launch|kick ?off|schedule)\\s+(?:an? |the |my )?(?:(?:new|another|fresh|next) )?${KINDS}${NOUN}\\b|\\b(?:new|another) ${KINDS}${NOUN}\\b`,
);
// running something: a run verb with a named tool or attack, or "scan <target>". Not "do", not
// "tools" alone, so "how do I see which tools were used?" is about tools.
const RUN = /\b(run|execute|launch|start|perform|trigger|fire|re-?run)\b[^.?!\n]{0,30}\b(scans?|nmap|sqlmap|nikto|nuclei|ffuf|exploits?|attacks?|payloads?|brute.?force)\b|\bscan\s+(https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/;
const ACT = /\b(approve|reject|deny|authori[sz]e|sign off on|grant)\b/;
const TOP = /\b(top|worst|most (severe|critical|serious|important|dangerous|urgent)|highest|biggest|riskiest|first to fix|fix first|prioriti[sz]e)\b/;
const FINDINGS =
  /\bfindings?\b|\bvuln|\bweakness|\bissues?\b|\brisks?\b|\bseverit|\bcritical\b|\bcvss\b|\bcwe\b|\bowasp\b|\bcve\b|\bexploitable\b|\banaly[sz]|\bwhat did (it|you|reconix) find\b|\bfound\b|\bsummar|\boverview\b|\binjection\b|\bxss\b|\bcross.site\b|\bcsrf\b|\bssrf\b|\bidor\b|\baccess control\b|\bauthori[sz]ation\b|\bauthentication\b|\bdisclosure\b|\bmisconfig|\bencoding\b|\bexpos(e|es|ed|ure)\b|\binsecure\b|\btraversal\b|\bdeserializ|\bcredentials?\b|\bsecrets?\b|\bfalse positives?\b/;
const APPROVALS =
  /\bapprov|\bwait(s|ing)? (on|for)\b|\bpending\b|\bdecid|\bdecision|\bgates?\b|\bgated\b|\bon hold\b|\bneeds? (me|my|you)\b|\bdouble.?check|\bsign.?off|\brisky (actions?|steps?)\b|\brejected (actions?|steps?|approvals?|requests?)\b|\b(actions?|steps?|approvals?|requests?) (were |was |got )?rejected\b|\bauthori[sz]ed by\b|\b(needed|needs|required|requires|given|gave) authori[sz]ation\b|\bauthori[sz]ation (needed|required|given|gates?)\b/;
const PROGRESS = /\bprogress\b|\bstatus\b|\bphases?\b|\bsteps?\b|\bhow far\b|\bremaining\b|\bleft to do\b|\bcomplet|\bfinish(ed)?\b|\bexecution\b|\bplan\b|\bstages?\b|\bsummar|\boverview\b|\bwhat happened\b/;
const TOOLS =
  /\btools?\b|\bnmap\b|\bsqlmap\b|\bnikto\b|\bnuclei\b|\bffuf\b|\bsemgrep\b|\bgitleaks\b|\bzap\b|\btestssl\b|\bscanners?\b|\bwhat ran\b|\bexecuted\b|\bcommands?\b|\brequests? (sent|made)\b|\bhow many requests\b|\bactivity\b|\b(tool|scan|scanner) outputs?\b|\boutputs? of\b|\bresults? of\b|\bwhich (scans?|checks?) (ran|were run)\b/;
const POLICY =
  /\bpolic|\bblock(ed|s)?\b(?! on)|\bout of scope\b|\boutside (the )?scope\b|\brefus|\bdenied\b|\bforbidden\b|\bguardrails?\b|\bscope (checks?|violations?|rules?)\b|\b(scope|policy) restrict|\brestrict\w* (did|does|on|of|by|from) (the )?(scope|policy|run)\b|\bdisallow|\bnot allowed\b|\bverdicts?\b|\bexcluded\b|\bprevented\b/;
const REPORT = /\breports?\b|\bexport|\bdownload|\bpdf\b|\bjson\b|\bdocx\b|\bword (?:file|document)\b|\bdeliverable|\bsarif\b|\bcsv\b|\bhtml\b/; // a format the dashboard no longer saves still asks about the report
// errors and failures of the run itself: the saved data has no error log and no failed state, so
// the reply says so (with the runs' real states). Only with the run in the sentence, and never
// when the question is about findings ("error-based SQL injection", "broken access control",
// "verbose error message disclosure" are weaknesses, not errors of the run).
const ERRORS = /\berrors?\b|\bfail(ed|ure|ures|ing|s)?\b|\bcrash(ed|es)?\b|\bwent wrong\b/;
const RUN_WORDS = /\b(runs?|assessments?|scans?|steps?|tools?|phases?|execution|pentests?|tui)\b/;
// "F-003", "f-3", "IMP-002"; the run-label prefix "RCX" (e.g. "RCX-001") is filtered out below.
const FINDING_ID = /(?<![\w-])([a-z]{1,4})-(\d{1,4})\b/gi;

/** A finding id in one spelling: "F-003" and "f-3" are both "F-3". */
export const findingKey = (id: string) => id.toUpperCase().replace(/^([A-Z]{1,4})-0*(\d)/, "$1-$2");

export function readIntent(question: string): Asked {
  const q = question.toLowerCase();
  const intents: Intent[] = [];
  const add = (i: Intent) => {
    if (!intents.includes(i)) intents.push(i);
  };
  const planning = PLAN.test(q) && !/\b(progress|status)\b/.test(q);
  if (planning) add("plan");
  if (!planning && RUN.test(q)) add("run");
  if (ACT.test(q)) add("act");
  if (TOP.test(q)) add("top");
  if (FINDINGS.test(q)) add("findings");
  if (APPROVALS.test(q) || ACT.test(q)) add("approvals");
  if (PROGRESS.test(q) && !(planning && !/\bprogress\b/.test(q))) add("progress");
  if (TOOLS.test(q) && !RUN.test(q)) add("tools");
  if (POLICY.test(q)) add("policy");
  if (REPORT.test(q)) add("report");
  if (ERRORS.test(q) && RUN_WORDS.test(q) && !FINDINGS.test(q) && !TOP.test(q)) add("errors");
  const findingIds = [...new Set([...question.matchAll(FINDING_ID)]
    .filter((m) => m[1].toUpperCase() !== "RCX")   // "RCX-001" is a run label, not a finding id
    .map((m) => findingKey(`${m[1]}-${m[2]}`)))].slice(0, 3);
  return { intents, findingIds };
}
