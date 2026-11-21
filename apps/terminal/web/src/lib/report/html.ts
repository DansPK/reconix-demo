/* The styled security report as a standalone HTML document, built from a saved assessment.
   A port of reconix/store/report_html.py, so the dashboard's PDF matches the TUI's: page 1 is
   the one-page executive summary, then detailed findings and the audit trail.

   Every value is HTML-escaped (tool output and operator text read as text, never markup) and
   the document carries no scripts (the dashboard's CSP would block them anyway). The route
   masks the assessment once more before it gets here (lib/report/mask.ts); this renderer prints
   text as given. */
import {
  type Assessment,
  type Finding,
  FINDING_SEVERITIES as ALL_SEV_ORDER,
  SEVERITIES as SEV_ORDER,
} from "@/lib/data/schema";
import { preferredProofLine } from "@/lib/api/adapt";

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
} from "./counts";

const SEV_CLASS: Record<string, string> = { CRITICAL: "crit", HIGH: "high", MEDIUM: "med", LOW: "low", NONE: "none", UNKNOWN: "unk" };
const VALIDATION_CLASS: Record<string, string> = { CONFIRMED: "confirmed", UNCONFIRMED: "unconfirmed", INCONCLUSIVE: "inconclusive" };
const STATUS_CLASS: Record<string, string> = { open: "open", fixed: "fixed", accepted: "accepted", "false-positive": "falsepos" };
const STATUS_LABEL: Record<string, string> = { open: "Open", fixed: "Fixed", accepted: "Accepted", "false-positive": "False positive" };

const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

/** `map[key]`, but only the map's own entries (a status named "constructor" is not one). */
const own = (map: Record<string, string>, key: string, fallback: string) => (Object.hasOwn(map, key) ? map[key] : fallback);

/** The document's own policy, for the printer's temp copy: no
    scripts, no requests, only its inline styles and data: images. */
export const META_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;

/** Escape one line of text, collapsing runs of whitespace (for inline copy). */
export function esc(value: unknown): string {
  return String(value ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/[&<>"']/g, (c) => escapeMap[c]);
}

/** Escape text but keep its spacing, for evidence shown in a <pre> block. */
export function escPre(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => escapeMap[c]);
}

export const shortDate = (iso: string | null | undefined) => (iso ? iso.split("T")[0] : "—");
export const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
export const sevRank = (s: string) => {
  const i = (SEV_ORDER as readonly string[]).indexOf(s.toUpperCase());
  return i < 0 ? SEV_ORDER.length : i;
};
/** The CSS class of a severity ("crit", "high", "med", "low", "none", "unk"). Anything else, such as an
    approval with no recorded risk, gets the neutral grey "info" pill: it is not a severity. */
export const sevClass = (severity: string) => own(SEV_CLASS, severity.toUpperCase(), "info");

/** Findings per severity; a severity off the scale counts as UNKNOWN (as lib/api/adapt.ts reads
    it), so the counts always add up to findings.length. */
export function counts(findings: Pick<Finding, "severity">[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ALL_SEV_ORDER.map((s) => [s, 0]));
  for (const f of findings) {
    const s = String(f.severity ?? "").toUpperCase();
    out[Object.hasOwn(out, s) ? s : "UNKNOWN"] += 1;
  }
  return out;
}

/** Each severity's whole-number share; largest remainder, so the shares add up to 100. */
export function percents(tally: Record<string, number>): Record<string, number> {
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const exact = Object.fromEntries(Object.entries(tally).map(([s, n]) => [s, total ? (100 * n) / total : 0]));
  const out: Record<string, number> = Object.fromEntries(Object.entries(exact).map(([s, x]) => [s, Math.floor(x)]));
  const left = total ? 100 - Object.values(out).reduce((a, b) => a + b, 0) : 0;
  const byRemainder = Object.keys(tally).sort((a, b) => exact[b] - out[b] - (exact[a] - out[a]));
  for (const s of byRemainder.slice(0, left)) out[s] += 1;
  return out;
}
export const pill = (severity: string) => `<span class="sev ${sevClass(severity)}">${esc(title(severity))}</span>`;
export const validation = (state: string) =>
  `<span class="val ${own(VALIDATION_CLASS, state.toUpperCase(), "inconclusive")}">${esc(title(state))}</span>`;

export function validationLine(f: Finding): string {
  const ev = f.effective_verification;
  if (ev) {
    if (ev.legacy) return "legacy, not verified";
    const status = ev.status;
    const tool = (ev.verifier || f.tool || "VALIDATION").toUpperCase();
    const proofLines = ev.proof_lines || [];
    const reason = ev.reason || "";
    const subject = ev.subject;
    const subjectLabel =
      subject && typeof subject === "object" && typeof (subject as Record<string, unknown>).label === "string"
        ? ((subject as Record<string, unknown>).label as string)
        : typeof subject === "string" && subject
          ? subject
          : undefined;
    if (status === "VERIFIED") {
      const proof = preferredProofLine(proofLines);
      const line = proof ? `✓ Verified by ${tool}: ${proof}` : `✓ Verified by ${tool}`;
      return subjectLabel ? `${line} — ${subjectLabel}` : line;
    }
    if (status === "NOT_REPRODUCED") {
      const line = `Not reproduced by ${tool}`;
      return subjectLabel ? `${line} — ${subjectLabel}` : line;
    }
    if (status === "INCONCLUSIVE") return reason ? `Inconclusive: ${reason}` : "Inconclusive";
    if (status === "DEFERRED") return reason ? `Deferred: ${reason}` : "Deferred";
    if (status === "UNVERIFIED") return "Not yet validated — a reviewer confirms it.";
  }
  const state = (f.validation || "UNCONFIRMED").toUpperCase();
  const classified = isClassifiedFinding(f);
  if (
    state === "CONFIRMED" ||
    (classified && findingCategory(f) === "CONFIRMED_VULNERABILITY") ||
    f.verification_status === "CONFIRMED"
  ) {
    return "legacy, not verified";
  }
  if (state === "INCONCLUSIVE") return "A validation ran but was inconclusive; a person decides.";
  return "Not yet validated — a reviewer confirms it.";
}

export const evidenceValidation = (f: Finding) => {
  const ev = f.effective_verification;
  if (ev) {
    if (ev.legacy) return `<span class="val inconclusive">legacy, not verified</span>`;
    const status = ev.status;
    const tool = (ev.verifier || f.tool || "VALIDATION").toUpperCase();
    if (status === "VERIFIED") return `<span class="val confirmed">Verified by ${esc(tool)}</span>`;
    if (status === "NOT_REPRODUCED") return `<span class="val inconclusive">Not reproduced by ${esc(tool)}</span>`;
    if (status === "INCONCLUSIVE") return `<span class="val inconclusive">Inconclusive</span>`;
    if (status === "DEFERRED") return `<span class="val inconclusive">Deferred</span>`;
    if (status === "UNVERIFIED") return `<span class="val unconfirmed">Unverified</span>`;
  }
  const state = (f.validation || "UNCONFIRMED").toUpperCase();
  if (
    state === "CONFIRMED" ||
    (isClassifiedFinding(f) && findingCategory(f) === "CONFIRMED_VULNERABILITY") ||
    f.verification_status === "CONFIRMED"
  ) {
    return `<span class="val inconclusive">legacy, not verified</span>`;
  }
  return `<span class="val ${own(VALIDATION_CLASS, state, "inconclusive")}">Evidence ${esc(title(state))}</span>`;
};
export const status = (f: Pick<Finding, "status">) => {
  const s = f.status || "open";
  return `<span class="st ${own(STATUS_CLASS, s, "open")}">${esc(own(STATUS_LABEL, s, s))}</span>`;
};
const cvss = (f: Finding) => {
  const score = scoreForReport(f);
  if (score == null) return "—";
  const value = score.toFixed(1);
  return isClassifiedFinding(f) ? value : `Claim ${value}`;
};

/* --- the fixed stylesheet (identical to the TUI's report) ----------------------------------- */
export const CSS = `
*{box-sizing:border-box}
:root{
  --paper:#fff; --ink:#141a24; --ink-soft:#434d5c; --muted:#636c7d; --faint:#6b7486;
  --line:#e3e7ec; --zebra:#f6f8fa;
  --navy-1:#17305a; --navy-2:#0e1f3e; --navy-ink:#eaf1fb; --navy-label:#8db0e2;
  --rule:#2f6fd0; --accent:#1f5fc0; --ok:#1a7b4a;
  --crit:#911a3c; --high:#d34426; --med:#986f0b; --low:#26864e; --info:#596573;
  --crit-wash:#f8e3ea; --high-wash:#fbe6de; --med-wash:#f8efd5;
  --low-wash:#e3f3ea; --info-wash:#eceff2; --ok-wash:#e1f2e9; --chip-wash:#eaf1fb;
}
html,body{margin:0}
body{background:#eceef2; color:var(--ink); font-size:12.5px; line-height:1.5;
  font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0; line-height:1.15}
p{margin:0}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
a{color:var(--accent); text-decoration:none}
.doc{max-width:860px; margin:0 auto; padding:26px 18px 70px; display:flex; flex-direction:column; gap:18px}
.sheet{background:var(--paper); border:1px solid var(--line); border-radius:12px;
  box-shadow:0 1px 2px rgba(18,26,40,.06),0 14px 40px rgba(18,26,40,.10);
  padding:34px; display:flex; flex-direction:column; gap:16px}
.mast{background:linear-gradient(140deg,var(--navy-1),var(--navy-2)); color:var(--navy-ink); border-radius:11px; padding:30px}
.mast .eye{color:var(--navy-label); font-weight:600; font-size:12px; letter-spacing:.34em}
.mast h1{color:#fff; font-size:34px; font-weight:700; letter-spacing:-.015em; margin-top:10px}
.mast .sub{color:#b9cdea; font-size:14px; margin-top:7px}
.mast .tgt{margin-top:16px; display:inline-block; font-size:14px; color:#fff; background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.22); border-radius:8px; padding:7px 12px; word-break:break-all}
.mast dl{margin:20px 0 0; display:grid; grid-template-columns:1fr 1fr; gap:13px 28px; max-width:560px}
.mast dt{color:var(--navy-label); font-size:9.5px; letter-spacing:.11em; text-transform:uppercase}
.mast dd{margin:2px 0 0; color:#fff; font-weight:600; font-size:13px}
.conf{margin-top:20px; display:inline-flex; align-items:center; gap:8px; border:1px solid #d08aa0; color:#ffd7e2;
  border-radius:999px; padding:6px 14px; font-size:11px; font-weight:600; letter-spacing:.08em}
.sh{display:flex; align-items:baseline; gap:10px; border-bottom:2.5px solid var(--rule); padding-bottom:5px}
.sh h2{font-size:15px; font-weight:700}
.sh .no{font-family:"IBM Plex Mono"; color:var(--accent); font-weight:600; font-size:13px}
.sh .tag{margin-left:auto; font-size:10px; color:var(--muted); font-family:"IBM Plex Mono"; text-transform:uppercase; letter-spacing:.07em}
.block{display:flex; flex-direction:column; gap:10px}
.summary{font-size:12.5px; color:var(--ink-soft)} .summary b{color:var(--ink)}
.eyebrow{font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted); font-weight:600}
.note{font-size:11px; color:var(--muted)} .note b{color:var(--ink-soft)}
.sev{display:inline-block; font-family:"IBM Plex Mono"; font-weight:600; font-size:10px; letter-spacing:.06em; color:#fff; border-radius:999px; padding:2px 9px}
.sev.crit{background:var(--crit)} .sev.high{background:var(--high)} .sev.med{background:var(--med)} .sev.low{background:var(--low)} .sev.info{background:var(--info)} .sev.none{background:var(--info)} .sev.unk{background:var(--ink-soft)}
.val{display:inline-block; font-family:"IBM Plex Mono"; font-weight:600; font-size:10px; letter-spacing:.04em; border-radius:999px; padding:2px 9px; border:1px solid currentColor}
.val.confirmed{color:var(--ok)} .val.unconfirmed{color:var(--med)} .val.inconclusive{color:var(--info)}
.st{display:inline-block; font-family:"IBM Plex Mono"; font-size:10px; font-weight:600; letter-spacing:.04em; border-radius:999px; padding:2px 8px; border:1px solid currentColor}
.st.open{color:var(--muted)} .st.fixed{color:var(--ok)} .st.accepted{color:var(--med)} .st.falsepos{color:var(--info)}
.grid2{display:grid; grid-template-columns:1.15fr 1fr; gap:18px; align-items:start}
.tiles{display:grid; grid-template-columns:repeat(7,1fr); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:10px; overflow:hidden}
.tile{background:var(--paper); padding:10px 6px; text-align:center}
.tile .n{font-family:"IBM Plex Mono"; font-weight:600; font-size:24px; line-height:1}
.tile .k{margin-top:5px; font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted)}
.tile.crit .n{color:var(--crit)} .tile.high .n{color:var(--high)} .tile.med .n{color:var(--med)} .tile.low .n{color:var(--low)}
.tile.none .n{color:var(--info)} .tile.unk .n{color:var(--ink-soft)}
.tile.tot .n{color:var(--accent)}
.dist{display:flex; height:22px; border-radius:6px; overflow:hidden; border:1px solid var(--line)}
.dist i{display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600; font-family:"IBM Plex Mono"}
.dist .crit{background:var(--crit)} .dist .high{background:var(--high)} .dist .med{background:var(--med)} .dist .low{background:var(--low)} .dist .none{background:var(--info)} .dist .unk{background:var(--ink-soft)}
.legend{display:flex; flex-wrap:wrap; gap:5px; margin-top:9px}
.tw{overflow-x:auto; border:1px solid var(--line); border-radius:10px}
.tw:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
table{border-collapse:collapse; width:100%; font-size:11.5px}
th,td{text-align:left; padding:6px 11px; border-bottom:1px solid var(--line); vertical-align:top}
thead th{background:var(--zebra); font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); font-weight:600}
tbody tr:last-child td{border-bottom:none}
td.id{font-family:"IBM Plex Mono"; font-weight:600; color:var(--accent); white-space:nowrap}
.kv{display:grid; grid-template-columns:150px 1fr; gap:8px 18px; font-size:12px}
.kv dt{color:var(--muted)} .kv dd{margin:0; color:var(--ink-soft)}
.chips{display:flex; flex-wrap:wrap; gap:6px}
.chip{font-family:"IBM Plex Mono"; font-size:11px; padding:2px 9px; border-radius:7px; background:var(--chip-wash); color:var(--accent)}
.chip.block{background:var(--crit-wash); color:var(--crit)} .chip.plain{background:var(--info-wash); color:var(--ink-soft)}
.disclaimer{color:var(--ink-soft); font-size:11.5px; background:var(--zebra); border:1px solid var(--line); border-radius:9px; padding:12px 14px}
.find{border:1px solid var(--line); border-radius:11px; overflow:hidden}
.find+.find{margin-top:14px}
.find-head{display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:11px 15px; border-bottom:1px solid var(--line); border-left:4px solid var(--line)}
.find.s-crit .find-head{border-left-color:var(--crit)} .find.s-high .find-head{border-left-color:var(--high)}
.find.s-med .find-head{border-left-color:var(--med)} .find.s-low .find-head{border-left-color:var(--low)} .find.s-info .find-head{border-left-color:var(--info)} .find.s-none .find-head{border-left-color:var(--info)} .find.s-unk .find-head{border-left-color:var(--ink-soft)}
.find-id{font-family:"IBM Plex Mono"; font-weight:600; color:var(--muted); font-size:12px}
.find-head h3{font-size:14.5px; font-weight:600; flex:1 1 220px; min-width:0}
.find-cvss{font-family:"IBM Plex Mono"; font-size:11px; color:var(--ink-soft); background:var(--zebra); border:1px solid var(--line); border-radius:7px; padding:2px 8px}
.find-body{padding:14px 15px; display:grid; gap:12px}
.find-meta{display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:9px; overflow:hidden}
.find-meta div{background:var(--paper); padding:8px 11px}
/* Four short facts fill row one; Mapping and the CVSS vector each take a full row. */
.find-meta div:nth-child(n+5){grid-column:1/-1}
.find-meta dt{font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted)}
.find-meta dd{margin:3px 0 0; font-family:"IBM Plex Mono"; font-size:11.5px; overflow-wrap:anywhere}
.fb{display:grid; gap:4px} .fb .eyebrow{color:var(--accent)}
.evidence{font-family:"IBM Plex Mono"; font-size:11.5px; line-height:1.65; background:var(--zebra); border:1px solid var(--line);
  border-left:3px solid var(--accent); border-radius:8px; padding:11px 13px; margin:0; overflow-x:auto; white-space:pre-wrap; word-break:break-word}
.remediate{background:var(--ok-wash); border:1px solid rgba(28,134,80,.3); border-radius:8px; padding:11px 13px}
.remediate .eyebrow{color:var(--ok)}
.pfoot{border-top:1px solid var(--line); padding-top:10px; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
  color:var(--faint); font-size:10px; font-family:"IBM Plex Mono"; text-transform:uppercase; letter-spacing:.06em}
@media (max-width:640px){ .grid2{grid-template-columns:1fr} .mast dl{grid-template-columns:1fr} .kv{grid-template-columns:1fr} .find-meta{grid-template-columns:repeat(2,1fr)} }
@media print{
  @page{size:A4; margin:8mm 8mm 12mm;
    @bottom-left{content:"Reconix — Confidential"; font:7pt "IBM Plex Mono"; color:#8a94a6}
    @bottom-right{content:"Page " counter(page) " of " counter(pages); font:7pt "IBM Plex Mono"; color:#8a94a6}}
  body{background:#fff; font-size:8.3pt; line-height:1.38}
  .doc{max-width:none; margin:0; padding:0; gap:0}
  .sheet{border:none; border-radius:0; box-shadow:none; padding:0; gap:7px}
  .sheet+.sheet{margin-top:0; break-before:page}
  .block{gap:5px} .tile{padding:7px 4px} .tile .n{font-size:20px} .dist{height:18px} .kv{gap:5px 16px}
  .mast{border-radius:8px; padding:11px 13px} .mast h1{font-size:18pt} .mast .sub{font-size:9pt}
  .mast .tgt{margin-top:8px; padding:4px 9px} .mast dl{margin-top:9px; gap:5px 20px}
  .summary{line-height:1.35} .disclaimer{padding:6px 10px; font-size:8pt}
  .find-body{gap:8px} .find+.find{margin-top:10px} .evidence{padding:8px 11px}
  th,td{padding:2.4px 8px} .pfoot{padding-top:6px}
  /* Long cards split across pages (no blank gaps); only their small parts stay whole. */
  tr,.find-head,.find-meta,.remediate,.fb>p{break-inside:avoid}
  .sh,.find-head,.eyebrow{break-after:avoid}
  *{-webkit-print-color-adjust:exact; print-color-adjust:exact}
}
`;

/* --- sections ------------------------------------------------------------------------------ */
function engagementWindow(a: Assessment): string {
  const start = shortDate(a.run.started_at);
  const end = shortDate(a.run.finished_at);
  if (start === "—" && end === "—") return "Time-boxed";
  return start === end ? start : `${start} → ${end}`;
}

function masthead(a: Assessment, generated: string): string {
  const template = a.template.name || "Security assessment";
  const rows: [string, string][] = [
    ["Client", a.client || "—"],
    ["Engagement ID", a.assessment_id || a.label || "—"],
    ["Assessment window", engagementWindow(a)],
    ["Report date", shortDate(generated)],
    ["Assessment type", a.mode || "—"],
    ["Report version", `${a.report_version || "1.0"} — Final`],
  ];
  const items = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  return (
    `<header class="mast"><div class="eye">RECONIX</div><h1>Security Assessment Report</h1>` +
    `<div class="sub">AI-Assisted Authorized Penetration Test — ${esc(template)}</div>` +
    `<div class="tgt mono">${esc(a.target_url || a.target || "—")}</div><dl>${items}</dl>` +
    `<div class="conf">&#128274; CONFIDENTIAL — AUTHORIZED RECIPIENTS ONLY</div></header>`
  );
}

export function severityBlock(findings: Finding[]): string {
  const c = counts(findings);
  const pcts = percents(c);
  const ratedTotal = ratedSecurityCount(reportCounts(findings).severity_counts);
  const present = ALL_SEV_ORDER.filter((s) => c[s]);
  const tiles =
    ALL_SEV_ORDER.map((s) => `<div class="tile ${SEV_CLASS[s]}"><div class="n">${c[s]}</div><div class="k">${esc(title(s))}</div></div>`).join("") +
    `<div class="tile tot"><div class="n">${findings.length}</div><div class="k">Total</div></div>`;
  const segs = present
    .map((s) => {
      const pct = pcts[s];
      return `<i class="${SEV_CLASS[s]}" style="width:${pct}%">${pct}%</i>`;
    })
    .join("");
  const legend = present.map((s) => `<span class="sev ${SEV_CLASS[s]}">${c[s]} ${esc(title(s))}</span>`).join("");
  return (
    `<div class="grid2"><div class="tiles">${tiles}</div>` +
    `<div><div class="eyebrow" style="margin-bottom:7px">Severity distribution</div>` +
    `<div class="dist">${segs}</div><div class="legend">${legend}</div></div></div>` +
    `<p class="note">${ratedTotal} rated security findings exclude false positives and NONE/UNKNOWN severities; tiles show all recorded findings.</p>`
  );
}

function narrative(a: Assessment, findings: Finding[], blocked: number, approvals: number): string {
  const totals = reportCounts(findings);
  const c = totals.severity_counts;
  const recordedCounts = counts(findings);
  const ratedTotal = ratedSecurityCount(c);
  const highest = SEV_ORDER.find((s) => c[s]) ?? "not rated";
  const breakdown = SEV_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${title(s)}`).join(", ") || "no rated security findings";
  const recordedBreakdown =
    ALL_SEV_ORDER.filter((severity) => recordedCounts[severity])
      .map((severity) => `${recordedCounts[severity]} ${title(severity)}`)
      .join(", ") || "no findings";
  const leadFinding = findings.find((f) => isRatedSecurityFinding(f) && severityForReport(f) === highest);
  const lead = leadFinding ? `, led by <b>${esc(leadFinding.title)}</b>` : "";
  const categories = Object.entries(totals.category_counts)
    .filter(([, count]) => count)
    .map(([category, count]) => `${count} ${categoryLabel(category as keyof typeof totals.category_counts)}`)
    .join(" · ") || "none";
  const vulnerabilityCounts = totals.vulnerability_counts;
  return (
    `<p class="summary">Reconix performed an authorized assessment of <b>${esc(a.target_url || a.target || "the target")}</b>` +
    ` (${esc(a.template.name || "assessment")}). It recorded <b>${findings.length} finding(s)</b>.` +
    ` Vulnerability counts: ${vulnerabilityCounts.CONFIRMED_VULNERABILITY} confirmed · ${vulnerabilityCounts.POTENTIAL_VULNERABILITY} potential.` +
    ` Findings by category: ${esc(categories)}. Severity totals cover ${ratedTotal} rated security finding(s) — ${esc(breakdown)}.` +
    ` Recorded severity labels: ${esc(recordedBreakdown)}.` +
    ` The highest rated severity is <b>${esc(title(highest))}</b>${lead}. ${blocked} out-of-scope request(s) were blocked by` +
    ` policy and ${approvals} gated action(s) were approved by a human. Intrusive actions ran only after explicit,` +
    ` single-use approval.</p>`
  );
}

function findingsTable(findings: Finding[]): string {
  const rows =
    findings
      .map(
        (f) =>
          `<tr><td class="id">${esc(f.id)}</td><td>${esc(f.title)}</td><td>${pill(severityForReport(f))}</td>` +
          `<td class="mono">${cvss(f)}</td><td>${status(f)}</td><td>${esc(categoryLabel(findingCategory(f)))}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">No findings were recorded.</td></tr>`;
  return (
    `<div class="tw" tabindex="0" role="region" aria-label="Findings table"><table><thead><tr><th>ID</th><th>Finding</th><th>Validated severity</th><th>CVSS</th>` +
    `<th>Status</th><th>Category</th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

export const chips = (items: string[], cls = "") => items.map((x) => `<span class="chip${cls}">${esc(x)}</span>`).join("");

function scopeBlock(a: Assessment): string {
  const s = a.scope;
  const approved =
    s?.status === "APPROVED" ? `<span class="val confirmed">Approved</span>` : `<span class="val inconclusive">Not approved</span>`;
  const standards = esc(a.methodology.join(" · ") || "—");
  return (
    `<dl class="kv"><dt>Approval status</dt><dd>${approved}</dd><dt>Standards</dt><dd>${standards}</dd>` +
    `<dt>Allowed actions</dt><dd><div class="chips">${chips(s?.allowed_actions ?? [])}</div></dd>` +
    `<dt>Allowed methods</dt><dd><div class="chips">${chips(s?.allowed_methods ?? [])}</div></dd>` +
    `<dt>Excluded paths</dt><dd><div class="chips">${chips(s?.excluded_paths ?? [], " block") || '<span class="note">none</span>'}</div></dd>` +
    `<dt>Time limit</dt><dd>${esc(s?.time_limit_minutes ?? 0)} minutes</dd>` +
    `<dt>Tools</dt><dd><div class="chips">${chips(s?.tools ?? [], " plain")}</div></dd></dl>`
  );
}

function findingCard(f: Finding): string {
  const classified = isClassifiedFinding(f);
  const category = findingCategory(f);
  const severity = severityForReport(f);
  const score = scoreForReport(f);
  const vectorValue = vectorForReport(f);
  const cls = sevClass(severity);
  const cardCls = cls === "info" ? "find" : `find s-${cls}`;
  const mapping = esc(identifiersForReport(f).join(", ") || "—");
  const badge = score == null
    ? ""
    : `<span class="find-cvss">${classified ? "Validated CVSS" : "Scanner CVSS claim (unvalidated)"} ${score.toFixed(1)}</span>`;
  const vector = vectorValue
    ? `<div><dt>${classified ? "Validated CVSS vector" : "Scanner CVSS vector claim (unvalidated)"}</dt><dd>${esc(vectorValue)}</dd></div>`
    : "";
  const evidence = f.evidence.map(escPre).join("\n") || "—";
  const evidenceSummary = f.evidence_summary ? `<p class="evidence-summary">${esc(f.evidence_summary)}</p>` : "";
  const note = f.triage_note ? `<div class="fb"><span class="eyebrow">Analyst note</span><p>${esc(f.triage_note)}</p></div>` : "";
  const uncertainty = f.classification_uncertainty
    ? `<div><dt>Uncertainty</dt><dd>${esc(f.classification_uncertainty)}</dd></div>`
    : "";
  const sourceClaims = f.source_claims?.length
    ? `<div class="fb"><span class="eyebrow">Original scanner claims (unvalidated)</span><p>${f.source_claims.map(esc).join("<br>")}</p></div>`
    : "";
  const reviewHistory = f.review_history?.length
    ? `<div class="fb"><span class="eyebrow">Analyst review history</span><p>${f.review_history.map(esc).join("<br>")}</p></div>`
    : "";
  const originalRating = !classified
    ? `<div class="fb"><span class="eyebrow">Original rating (scanner/legacy claim; unvalidated)</span><p>${esc(originalRatingClaim(f))}</p></div>`
    : "";
  const valLine = validationLine(f);
  const valHtml = valLine ? `<p class="validation-line">${esc(valLine)}</p>` : "";
  const aiNotes = f.ai_notes;
  const aiNotesHtml =
    aiNotes && (aiNotes.explanation || aiNotes.impact || aiNotes.remediation || aiNotes.uncertainty)
      ? `<div class="fb"><span class="eyebrow">AI assessment (not verified)</span>` +
        (aiNotes.explanation ? `<p>${esc(aiNotes.explanation)}</p>` : "") +
        (aiNotes.impact ? `<p><strong>Impact:</strong> ${esc(aiNotes.impact)}</p>` : "") +
        (aiNotes.remediation ? `<p><strong>Remediation:</strong> ${esc(aiNotes.remediation)}</p>` : "") +
        (aiNotes.uncertainty ? `<p><strong>Uncertainty:</strong> ${esc(aiNotes.uncertainty)}</p>` : "") +
        `</div>`
      : "";
  return (
    `<div class="${cardCls}"><div class="find-head"><span class="find-id">${esc(f.id)}</span><h3>${esc(f.title)}</h3>` +
    `${pill(severity)}${evidenceValidation(f)}${status(f)}${badge}</div><div class="find-body"><dl class="find-meta">` +
    `<div><dt>Affected asset</dt><dd>${esc(f.affected_url || "—")}</dd></div><div><dt>Location</dt><dd>${esc(f.path || "—")}</dd></div>` +
    `<div><dt>Finding category</dt><dd>${esc(categoryLabel(category))}</dd></div>` +
    `<div><dt>Validated severity</dt><dd>${esc(severity)}</dd></div>` +
    `<div><dt>Confidence</dt><dd>${esc(f.confidence_level || "UNKNOWN")}</dd></div>` +
    `<div><dt>Evidence quality</dt><dd>${esc(f.evidence_quality || "UNKNOWN")}</dd></div>` +
    `<div><dt>Verification</dt><dd>${esc(f.verification_status || "UNKNOWN")}</dd></div>` +
    `<div><dt>Exploitability</dt><dd>${esc(f.exploitability || "UNKNOWN")}</dd></div>` +
    `<div><dt>Detected by</dt><dd>${esc(f.tool || "—")}</dd></div>` +
    `<div><dt>${classified ? "Validated identifiers" : "Scanner identifier claims (unvalidated)"}</dt><dd>${mapping}</dd></div>` +
    `${uncertainty}${vector}</dl>` +
    section("Description", f.description) +
    aiNotesHtml +
    `<div class="fb"><span class="eyebrow">Evidence &amp; validation (masked)</span>${evidenceSummary}${valHtml}<pre class="evidence">${evidence}</pre></div>` +
    section("Impact", f.impact) +
    section("Remediation", f.remediation, "remediate") +
    `${originalRating}${sourceClaims}${reviewHistory}${note}` +
    `</div></div>`
  );
}

/** A labelled block of a finding card, or nothing when its text is blank (no empty headings). */
function section(label: string, text: unknown, cls = "fb"): string {
  const body = esc(text);
  return body ? `<div class="${cls}"><span class="eyebrow">${label}</span><p>${body}</p></div>` : "";
}

function governance(a: Assessment): string {
  const blocked = a.verdicts.filter((v) => !v.allowed);
  const blockedRows =
    blocked.map((v) => `<tr><td class="mono">${esc(`${v.method} ${v.path}`)}</td><td>${esc(v.reason)}</td></tr>`).join("") ||
    `<tr><td colspan="2">No requests were blocked.</td></tr>`;
  const decisionRows =
    a.decisions
      .map((d) => {
        const req = a.approvals.find((p) => p.request_id === d.request_id);
        return (
          `<tr><td>${pill(req?.risk ?? "INFO")}</td><td>${esc(req?.action ?? d.request_id)}</td>` +
          `<td class="mono">${esc(req?.target ?? "")}</td><td>${validation(d.decision)}</td><td>${esc(d.operator || "—")}</td></tr>`
        );
      })
      .join("") || `<tr><td colspan="5">No gated actions were required.</td></tr>`;
  return (
    `<div class="eyebrow" style="margin-bottom:8px">Blocked by policy · ${blocked.length}</div>` +
    `<div class="tw" tabindex="0" role="region" aria-label="Requests blocked by policy"><table><thead><tr><th>Request</th><th>Reason</th></tr></thead><tbody>${blockedRows}</tbody></table></div>` +
    `<div class="eyebrow" style="margin:14px 0 8px">Human approvals · ${a.decisions.length}</div>` +
    `<div class="tw" tabindex="0" role="region" aria-label="Human approval decisions"><table><thead><tr><th>Risk</th><th>Action</th><th>Target</th><th>Decision</th><th>Analyst</th></tr></thead>` +
    `<tbody>${decisionRows}</tbody></table></div>`
  );
}

/** The complete, self-contained HTML report for one saved assessment. */
export function renderReportHtml(a: Assessment, now: Date = new Date()): string {
  const generated = now.toISOString();
  const findings = [...a.findings].sort((x, y) => sevRank(severityForReport(x)) - sevRank(severityForReport(y)) || x.id.localeCompare(y.id));
  const blocked = a.verdicts.filter((v) => !v.allowed).length;
  const approved = a.decisions.filter((d) => d.decision === "APPROVED").length;
  const engagement = esc(a.assessment_id || a.label || "—");
  const cards = findings.map(findingCard).join("") || `<p class="note">No findings.</p>`;
  const body =
    `<main class="doc">` +
    `<section class="sheet">${masthead(a, generated)}` +
    `<p class="note"><b>Generated by Reconix.</b> AI-guided assessment; the policy engine, approvals and vault are deterministic.` +
    ` Credentials and one-time codes are never stored or shown, and evidence is masked at the source.</p>` +
    `<section class="block"><div class="sh"><span class="no">1</span><h2>Executive summary</h2></div>` +
    `${narrative(a, findings, blocked, approved)}${severityBlock(findings)}</section>` +
    `<section class="block"><div class="sh"><span class="no">2</span><h2>Findings summary</h2>` +
    `<span class="tag">${findings.length} findings</span></div>${findingsTable(findings)}</section>` +
    `<section class="block"><div class="sh"><span class="no">3</span><h2>Approved scope &amp; limitations</h2></div>${scopeBlock(a)}` +
    `<div class="disclaimer">Testing was limited to the approved actions, methods and time window. Requests to an excluded` +
    ` path or outside the allowed methods were refused by the policy engine rather than sent. Findings reflect only what` +
    ` was observed under these constraints.</div></section>` +
    `<div class="pfoot"><span>Reconix — AI-Powered Security Testing Assistant</span>` +
    `<span>Confidential · ${engagement} · Generated ${esc(shortDate(generated))}</span></div></section>` +
    `<section class="sheet"><section class="block"><div class="sh"><span class="no">4</span><h2>Detailed findings</h2></div>${cards}</section>` +
    `<section class="block"><div class="sh"><span class="no">5</span><h2>Policy &amp; governance</h2><span class="tag">Audit trail</span></div>` +
    `${governance(a)}</section><div class="pfoot"><span>Reconix — Confidential</span><span>${engagement} · End of report</span></div></section>` +
    `</main>`;
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">${META_CSP}<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Reconix Report — ${engagement}</title><style>${CSS}</style></head><body>${body}</body></html>\n`
  );
}
