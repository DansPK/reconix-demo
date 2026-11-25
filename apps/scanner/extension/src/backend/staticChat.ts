// Answers to chat questions, built from the session's latest scan (pure Node, no vscode import).
// The scanner server has no LLM: its replies come from the findings.
import { countBySeverity, firstSentence, hiddenAsFalse, mergeFindings, prepareFindings, SEVERITY_ORDER, type MergedFinding } from "../findingsLogic";
import { findingsNamed, pathsIn, severitiesIn } from "../routing";
import type { ChatAction, Finding, Severity, SummaryCard } from "../shared/contract";

export interface StaticAnswer {
  /** Markdown. */
  text: string;
  actions: ChatAction[];
}

/** How many findings a list shows before "and N more". */
const LIST_LIMIT = 5;

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low", UNKNOWN: "unrated", NONE: "informational",
};

const STOPWORDS = new Set(("a an and any are about can could did do does find for from give have how i in is it its me my " +
  "of on or please show tell that the there these this those to was we what when where which who why with you your " +
  "problem problems issue issues finding findings code project file files any vulnerability vulnerabilities").split(" "));

const HELP = [
  "I can:",
  "",
  "- **scan** the project: \"scan this project\", or \"scan everything again from scratch\"",
  "- **explain** a finding: \"explain f-…\", or click **Ask in chat** on a finding",
  "- list **the most serious problems**, a **severity** (\"show the high ones\") or a **file** (\"what's wrong in config.js?\")",
  "- look for a **topic**: \"any SQL injection?\", \"hard-coded secrets?\"",
  "- explain the **false alarms**, and give **counts**",
  "- **fix** findings: \"fix all high findings\", \"fix config.js\", or \"fix it\" after I list something",
].join("\n");

/**
 * Answers a question from the latest finished scan's raw findings (false positives included);
 * `raw` is undefined when no scan has finished in this session.
 */
export function staticAnswer(text: string, raw: Finding[] | undefined): StaticAnswer {
  if (raw === undefined) {
    return {
      text: "I haven't scanned this project yet, so I have nothing to go on. Ask me to **scan this project**, and then ask me about the findings.",
      actions: [{ kind: "scanWorkspace", label: "Scan this project" }],
    };
  }
  // Merged like the Findings tab. "False alarms" are all likely false positives; core's rule hides only
  // some of them (never a serious problem or a secret on the AI's word alone).
  const shown = prepareFindings(raw, false).findings;
  const hidden = mergeFindings(raw.filter(hiddenAsFalse));
  const all = [...shown, ...hidden];
  const falseAlarms = all.filter((f) => f.verdict === "LIKELY_FALSE_POSITIVE");
  const problems = shown.filter((f) => f.verdict !== "LIKELY_FALSE_POSITIVE");
  const low = text.toLowerCase();

  if (/\b(help|what can you do|how does this work|what do you do)\b/.test(low)) {
    return { text: HELP, actions: [] };
  }

  const named = findingsNamed(text, all);
  if (named.length > 0) return explain(named[0]);

  if (/\bfalse (alarm|positive)s?\b|\bnot real\b/.test(low)) {
    if (falseAlarms.length === 0) return { text: "None of the findings look like false alarms.", actions: [] };
    const lines = falseAlarms.slice(0, LIST_LIMIT).map((f) => `- ${loc(f)}: ${f.title}. ${firstSentence(f.explanation)}`);
    const n = falseAlarms.length;
    const why = "a serious problem or a secret stays in sight, since the review alone can't rule it out";
    const where = hidden.length === n ? `, so ${n === 1 ? "it is" : "they are"} hidden in the Findings tab`
      : hidden.length === 0 ? `. ${n === 1 ? "It stays" : "They stay"} in the Findings tab: ${why}`
      : `. ${hidden.length} of them ${hidden.length === 1 ? "is" : "are"} hidden in the Findings tab; ${why}`;
    return {
      text: `${n} finding${n === 1 ? " looks" : "s look"} like a false alarm${where}:\n\n${lines.join("\n")}${more(n)}`,
      actions: [],
    };
  }

  const paths = pathsIn(text, all);
  if (paths.size > 0) {
    const inFiles = problems.filter((f) => paths.has(f.path));
    const names = [...paths].map((p) => `\`${p}\``).join(", ");
    if (inFiles.length === 0) return { text: `I found no real problems in ${names}.`, actions: [] };
    return listAnswer(`${inFiles.length} problem${inFiles.length === 1 ? "" : "s"} in ${names}:`, inFiles);
  }

  if (/\b(most serious|serious|worst|top|priorit\w*|first|urgent|dangerous|important|biggest|riskiest)\b/.test(low)) {
    if (problems.length === 0) return { text: "The last scan found no real problems.", actions: [] };
    return listAnswer("The most serious problems, worst first:", problems);
  }

  const severities = severitiesIn(text);
  if (severities.size > 0) {
    const matching = problems.filter((f) => severities.has(f.severity));
    const which = SEVERITY_ORDER.filter((s) => severities.has(s)).map((s) => SEVERITY_LABEL[s]).join(" and ");
    if (matching.length === 0) return { text: `There are no ${which} findings.`, actions: [] };
    return listAnswer(`${matching.length} ${which} finding${matching.length === 1 ? "" : "s"}:`, matching);
  }

  if (/\b(how many|count|counts|overview|status|total|number of)\b/.test(low)) {
    return { text: countsText(problems, falseAlarms.length), actions: [] };
  }

  // A topic: the words of the question matched against each finding's title, rule, CWE and message.
  const words = (low.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length > 0) {
    const scored = shown
      .map((f) => ({ f, score: words.filter((w) => haystack(f).includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored.length > 0 ? scored[0].score : 0;
    const hits = scored.filter((x) => x.score === best).map((x) => x.f);
    if (hits.length === 1) return explain(hits[0]);
    if (hits.length > 1) return listAnswer(`${hits.length} findings match:`, hits);
  }

  return {
    text: `I answer from the last scan. ${countsText(problems, falseAlarms.length)}\n\nTry \"what are the most serious problems?\", \"what's wrong in config.js?\" or \"help\".`,
    actions: [],
  };
}

function explain(f: MergedFinding): StaticAnswer {
  const parts = [
    `**${f.title}** in \`${loc(f)}\``,
    `Severity ${SEVERITY_LABEL[f.severity]}, ${f.verdict === "LIKELY_FALSE_POSITIVE" ? "likely a false alarm" : f.verdict === "UNVERIFIED" ? "not verified yet" : "likely real"}. Found by ${f.tools.join(" + ")} (${f.ruleIds.join(", ")}${f.cwe?.length ? `; ${f.cwe.join(", ")}` : ""}).`,
  ];
  if (f.explanation) parts.push(`**What's wrong**\n\n${f.explanation}`);
  else parts.push(f.message);
  if (f.fixRecommendation) parts.push(`**How to fix**\n\n${f.fixRecommendation}`);
  if (f.manualFix) parts.push(`**Needs a manual fix:** ${f.manualFix}`);
  const actions: ChatAction[] = f.verdict === "LIKELY_FALSE_POSITIVE" || f.manualFix ? [] : [{ kind: "fixFindings", label: "Fix this", findingIds: [f.id] }];
  return { text: parts.join("\n\n"), actions };
}

function listAnswer(heading: string, findings: MergedFinding[]): StaticAnswer {
  const shown = findings.slice(0, LIST_LIMIT);
  const lines = shown.map((f, i) => `${i + 1}. **${f.title}** (${SEVERITY_LABEL[f.severity]}) in \`${loc(f)}\`${f.manualFix ? " — manual fix" : ""}`);
  // Only findings the agent can fix get a Fix button: never a manual fix or a likely false alarm.
  const ids = shown.filter((f) => !f.manualFix && f.verdict !== "LIKELY_FALSE_POSITIVE").map((f) => f.id);
  const others = shown.some((f) => f.verdict === "LIKELY_FALSE_POSITIVE") ? "need a manual fix or look like false alarms" : "need a manual fix";
  const tail = ids.length === 0 ? "None of these can be fixed automatically; ask me to explain one to see why."
    : ids.length < shown.length ? `Ask me to explain one. I can fix ${ids.length} of them; the others ${others}.`
    : `Ask me to explain one, or to fix ${shown.length === 1 ? "it" : "them"}.`;
  return {
    text: `${heading}\n\n${lines.join("\n")}${more(findings.length)}\n\n${tail}`,
    actions: ids.length === 0 ? [] : [{ kind: "fixFindings", label: ids.length === 1 ? "Fix it" : `Fix these ${ids.length}`, findingIds: ids }],
  };
}

function countsText(shown: MergedFinding[], falseAlarms: number): string {
  if (shown.length === 0) {
    return falseAlarms ? `The last scan found no real problems (${falseAlarms} likely false alarm${falseAlarms === 1 ? "" : "s"}).` : "The last scan found no problems.";
  }
  const counts = countBySeverity(shown);
  const parts = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${SEVERITY_LABEL[s]}`);
  return `The last scan found ${shown.length} problem${shown.length === 1 ? "" : "s"}: ${parts.join(", ")}${falseAlarms ? `, plus ${falseAlarms} likely false alarm${falseAlarms === 1 ? "" : "s"}` : ""}.`;
}

function loc(f: Finding): string {
  return f.line !== undefined ? `${f.path}:${f.line}` : f.path;
}

function more(total: number): string {
  return total > LIST_LIMIT ? `\n\n…and ${total - LIST_LIMIT} more in the Findings tab.` : "";
}

function haystack(f: MergedFinding): string {
  return `${f.title} ${f.ruleIds.join(" ")} ${(f.cwe ?? []).join(" ")} ${f.message} ${f.path}`.toLowerCase();
}

/**
 * The summary card from a finished scan's raw findings, with no LLM (the harness's summary_card
 * plus a templated overall). `canFix` puts findings with a static fix first among equals, so the
 * card's Fix buttons work.
 */
export function staticSummary(raw: Finding[], canFix: (f: Finding) => boolean = () => false): { card: SummaryCard; text: string } {
  const shown = prepareFindings(raw, false).findings;
  const hidden = mergeFindings(raw.filter(hiddenAsFalse));
  const total = shown.length + hidden.length;
  // Every likely false alarm, the ones core keeps in sight (HIGH, CRITICAL, secrets) included.
  const falseAlarms = hidden.length + shown.filter((f) => f.verdict === "LIKELY_FALSE_POSITIVE").length;
  const perFile = new Map<string, number>();
  for (const f of shown) perFile.set(f.path, (perFile.get(f.path) ?? 0) + 1);
  const files = [...perFile].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([path, count]) => ({ path, count }));

  const real = shown.filter((f) => f.verdict === "CONFIRMED" || f.verdict === "LIKELY_TRUE_POSITIVE");
  const urgent = [...real].sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || Number(canFix(b)) - Number(canFix(a)));
  const fixFirst = urgent.slice(0, 3).map((f) => ({ text: `${f.title} in ${loc(f)}`, findingIds: [f.id] }));

  const counts = countBySeverity([...shown, ...hidden]);
  const serious = counts.CRITICAL + counts.HIGH;
  let overall: string | undefined;
  if (real.length > 0) {
    const worst = urgent[0];
    overall = serious > 0
      ? `${serious} critical or high problem${serious === 1 ? " needs" : "s need"} attention before release; the most urgent is ${worst.title.charAt(0).toLowerCase()}${worst.title.slice(1)} in \`${worst.path}\`.`
      : `No critical or high problems; the worst is ${worst.title.charAt(0).toLowerCase()}${worst.title.slice(1)} in \`${worst.path}\`.`;
  }
  const card: SummaryCard = { total, counts, likelyReal: real.length, falseAlarms, files, overall, fixFirst };
  return { card, text: cardMarkdown(card) };
}

/** The card as short Markdown (the harness's card_markdown). */
export function cardMarkdown(card: SummaryCard): string {
  if (card.total === 0) return "**No findings.**";
  const counts = SEVERITY_ORDER.filter((s) => card.counts[s] > 0).map((s) => `${card.counts[s]} ${SEVERITY_LABEL[s]}`).join(" · ");
  let line = `**${card.total} finding${card.total === 1 ? "" : "s"}** (${counts}). `;
  if (card.falseAlarms === card.total) {
    line += card.total === 1 ? "It looks like a false alarm." : "All look like false alarms.";
  } else {
    line += `${card.likelyReal} look${card.likelyReal === 1 ? "s" : ""} real` +
      (card.falseAlarms ? `, ${card.falseAlarms} look${card.falseAlarms === 1 ? "s" : ""} like false alarms.` : ".");
  }
  if (card.files.length) line += `\nMost affected: ${card.files.map((f) => `\`${f.path}\` (${f.count})`).join(", ")}.`;
  const parts = [line];
  if (card.overall) parts.push(card.overall);
  if (card.fixFirst.length) parts.push(`**Fix first:**\n${card.fixFirst.map((x, i) => `${i + 1}. ${x.text}`).join("\n")}`);
  return parts.join("\n\n");
}
