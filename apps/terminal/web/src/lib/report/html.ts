/* The styled security report as a standalone HTML document, built from a saved assessment.
   A port of reconix/store/report_html.py, so the dashboard's PDF matches the TUI's: page 1 is
   the one-page executive summary, then detailed findings and the audit trail.

   Every value is HTML-escaped (tool output and operator text read as text, never markup) and
   the document carries no scripts (the dashboard's CSP would block them anyway). The route
   masks the assessment once more before it gets here (lib/report/mask.ts); this renderer prints
   text as given. The helpers and the stylesheet are exported for the combined report
   (combined/html.ts), which must look the same. */
import { type Assessment, type Finding, SEVERITIES as SEV_ORDER } from "@/lib/data/schema";

import { FONT_FACES } from "./fonts";

const SEV_CLASS: Record<string, string> = { CRITICAL: "crit", HIGH: "high", MEDIUM: "med", LOW: "low" };
const VALIDATION_CLASS: Record<string, string> = { CONFIRMED: "confirmed", UNCONFIRMED: "unconfirmed", INCONCLUSIVE: "inconclusive" };
const STATUS_CLASS: Record<string, string> = { open: "open", fixed: "fixed", accepted: "accepted", "false-positive": "falsepos" };
const STATUS_LABEL: Record<string, string> = { open: "Open", fixed: "Fixed", accepted: "Accepted", "false-positive": "False+" };

const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

/** `map[key]`, but only the map's own entries (a status named "constructor" is not one). */
const own = (map: Record<string, string>, key: string, fallback: string) => (Object.hasOwn(map, key) ? map[key] : fallback);

/** The document's own policy, for the printer's temp copy and the combined preview's frame: no
    scripts, no requests, only its inline styles and data: images. */
export const META_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;

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
/** The CSS class of a severity ("crit", "high", "med", "low"). Anything else, such as an
    approval with no recorded risk, gets the neutral grey "info" pill: it is not a severity. */
export const sevClass = (severity: string) => own(SEV_CLASS, severity.toUpperCase(), "info");

function counts(findings: Pick<Finding, "severity">[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(SEV_ORDER.map((s) => [s, 0]));
  for (const f of findings) if (Object.hasOwn(out, f.severity)) out[f.severity] += 1;
  return out;
}

export const pill = (severity: string) => `<span class="sev ${sevClass(severity)}">${esc(title(severity))}</span>`;
export const validation = (state: string) =>
  `<span class="val ${own(VALIDATION_CLASS, state.toUpperCase(), "inconclusive")}">${esc(title(state))}</span>`;
export const status = (f: Pick<Finding, "status">) => {
  const s = f.status || "open";
  return `<span class="st ${own(STATUS_CLASS, s, "open")}">${esc(own(STATUS_LABEL, s, s))}</span>`;
};
const cvss = (f: Finding) => (f.cvss_score ? f.cvss_score.toFixed(1) : "—");

/* --- the fixed stylesheet (identical to the TUI's report) ----------------------------------- */
export const CSS = `
${FONT_FACES}
*{box-sizing:border-box}
:root{
  --paper:#fff; --ink:#141a24; --ink-soft:#434d5c; --muted:#7c8699; --faint:#a4adbd;
  --line:#e3e7ec; --zebra:#f6f8fa;
  --navy-1:#17305a; --navy-2:#0e1f3e; --navy-ink:#eaf1fb; --navy-label:#8db0e2;
  --rule:#2f6fd0; --accent:#1f5fc0; --ok:#1c8650;
  --crit:#911a3c; --high:#d9492a; --med:#c7920f; --low:#2a9657; --info:#596573;
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
.sev.crit{background:var(--crit)} .sev.high{background:var(--high)} .sev.med{background:var(--med)} .sev.low{background:var(--low)} .sev.info{background:var(--info)}
.val{display:inline-block; font-family:"IBM Plex Mono"; font-weight:600; font-size:10px; letter-spacing:.04em; border-radius:999px; padding:2px 9px; border:1px solid currentColor}
.val.confirmed{color:var(--ok)} .val.unconfirmed{color:var(--med)} .val.inconclusive{color:var(--info)}
.st{display:inline-block; font-family:"IBM Plex Mono"; font-size:10px; font-weight:600; letter-spacing:.04em; border-radius:999px; padding:2px 8px; border:1px solid currentColor}
.st.open{color:var(--muted)} .st.fixed{color:var(--ok)} .st.accepted{color:var(--med)} .st.falsepos{color:var(--info)}
.grid2{display:grid; grid-template-columns:1.15fr 1fr; gap:18px; align-items:start}
.tiles{display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:10px; overflow:hidden}
.tile{background:var(--paper); padding:10px 6px; text-align:center}
.tile .n{font-family:"IBM Plex Mono"; font-weight:600; font-size:24px; line-height:1}
.tile .k{margin-top:5px; font-size:9px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted)}
.tile.crit .n{color:var(--crit)} .tile.high .n{color:var(--high)} .tile.med .n{color:var(--med)} .tile.low .n{color:var(--low)}
.tile.tot .n{color:var(--accent)}
.dist{display:flex; height:22px; border-radius:6px; overflow:hidden; border:1px solid var(--line)}
.dist i{display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600; font-family:"IBM Plex Mono"}
.dist .crit{background:var(--crit)} .dist .high{background:var(--high)} .dist .med{background:var(--med)} .dist .low{background:var(--low)}
.legend{display:flex; flex-wrap:wrap; gap:5px; margin-top:9px}
.tw{overflow-x:auto; border:1px solid var(--line); border-radius:10px}
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
.find{border:1px solid var(--line); border-radius:11px; overflow:hidden; break-inside:avoid}
.find+.find{margin-top:14px}
.find-head{display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:11px 15px; border-bottom:1px solid var(--line); border-left:4px solid var(--line)}
.find.s-crit .find-head{border-left-color:var(--crit)} .find.s-high .find-head{border-left-color:var(--high)}
.find.s-med .find-head{border-left-color:var(--med)} .find.s-low .find-head{border-left-color:var(--low)}
.find-id{font-family:"IBM Plex Mono"; font-weight:600; color:var(--muted); font-size:12px}
.find-head h3{font-size:14.5px; font-weight:600; flex:1 1 220px; min-width:0}
.find-cvss{font-family:"IBM Plex Mono"; font-size:11px; color:var(--ink-soft); background:var(--zebra); border:1px solid var(--line); border-radius:7px; padding:2px 8px}
.find-body{padding:14px 15px; display:grid; gap:12px}
.find-meta{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:9px; overflow:hidden}
.find-meta div{background:var(--paper); padding:8px 11px}
.find-meta dt{font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted)}
.find-meta dd{margin:3px 0 0; font-family:"IBM Plex Mono"; font-size:11.5px; word-break:break-all}
.fb{display:grid; gap:4px} .fb .eyebrow{color:var(--accent)}
.evidence{font-family:"IBM Plex Mono"; font-size:11.5px; line-height:1.65; background:var(--zebra); border:1px solid var(--line);
  border-left:3px solid var(--accent); border-radius:8px; padding:11px 13px; margin:0; overflow-x:auto; white-space:pre-wrap; word-break:break-word}
.remediate{background:var(--ok-wash); border:1px solid rgba(28,134,80,.3); border-radius:8px; padding:11px 13px}
.remediate .eyebrow{color:var(--ok)}
.pfoot{border-top:1px solid var(--line); padding-top:10px; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
  color:var(--faint); font-size:10px; font-family:"IBM Plex Mono"; text-transform:uppercase; letter-spacing:.06em}
@media (max-width:640px){ .grid2{grid-template-columns:1fr} .mast dl{grid-template-columns:1fr} .kv{grid-template-columns:1fr} }
@media print{
  @page{size:A4; margin:8mm}
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
  .find,tr{break-inside:avoid}
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

export function severityBlock(findings: Pick<Finding, "severity">[]): string {
  const c = counts(findings);
  const total = findings.length || 1;
  const present = SEV_ORDER.filter((s) => c[s]);
  // the four severities and the total: the grid's five columns
  const tiles =
    SEV_ORDER.map((s) => `<div class="tile ${SEV_CLASS[s]}"><div class="n">${c[s]}</div><div class="k">${esc(title(s))}</div></div>`).join("") +
    `<div class="tile tot"><div class="n">${findings.length}</div><div class="k">Total</div></div>`;
  const segs = present
    .map((s) => {
      const pct = Math.round((100 * c[s]) / total);
      return `<i class="${SEV_CLASS[s]}" style="width:${pct}%">${pct}%</i>`;
    })
    .join("");
  const legend = present.map((s) => `<span class="sev ${SEV_CLASS[s]}">${c[s]} ${esc(title(s))}</span>`).join("");
  return (
    `<div class="grid2"><div class="tiles">${tiles}</div>` +
    `<div><div class="eyebrow" style="margin-bottom:7px">Severity distribution</div>` +
    `<div class="dist">${segs}</div><div class="legend">${legend}</div></div></div>`
  );
}

function narrative(a: Assessment, findings: Finding[], blocked: number, approvals: number): string {
  const c = counts(findings);
  const highest = SEV_ORDER.find((s) => c[s]) ?? "NONE"; // no findings: "None"
  const breakdown = SEV_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${title(s)}`).join(", ") || "no findings";
  const lead = findings.length ? `, led by <b>${esc(findings[0].title)}</b>` : "";
  return (
    `<p class="summary">Reconix performed an authorized assessment of <b>${esc(a.target_url || a.target || "the target")}</b>` +
    ` (${esc(a.template.name || "assessment")}). It recorded <b>${findings.length} finding(s)</b> — ${esc(breakdown)}.` +
    ` The highest severity is <b>${esc(title(highest))}</b>${lead}. ${blocked} out-of-scope request(s) were blocked by` +
    ` policy and ${approvals} gated action(s) were approved by a human. Intrusive actions ran only after explicit,` +
    ` single-use approval.</p>`
  );
}

function findingsTable(findings: Finding[]): string {
  const rows =
    findings
      .map(
        (f) =>
          `<tr><td class="id">${esc(f.id)}</td><td>${esc(f.title)}</td><td>${pill(f.severity)}</td>` +
          `<td class="mono">${cvss(f)}</td><td>${status(f)}</td><td>${esc(f.category || "—")}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">No findings were recorded.</td></tr>`;
  return (
    `<div class="tw"><table><thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th>CVSS</th>` +
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
  const cls = sevClass(f.severity);
  const mapping = esc([...f.owasp, ...f.cwe, ...f.cve].join(", ") || "—");
  const badge = f.cvss_score ? `<span class="find-cvss">CVSS ${f.cvss_score.toFixed(1)}</span>` : "";
  const vector = f.cvss_vector ? `<div><dt>CVSS vector</dt><dd>${esc(f.cvss_vector)}</dd></div>` : "";
  const evidence = f.evidence.map(escPre).join("\n") || "—";
  const note = f.triage_note ? `<div class="fb"><span class="eyebrow">Analyst note</span><p>${esc(f.triage_note)}</p></div>` : "";
  return (
    `<div class="find s-${cls}"><div class="find-head"><span class="find-id">${esc(f.id)}</span><h3>${esc(f.title)}</h3>` +
    `${pill(f.severity)}${validation(f.validation)}${status(f)}${badge}</div><div class="find-body"><dl class="find-meta">` +
    `<div><dt>Affected asset</dt><dd>${esc(f.affected_url || "—")}</dd></div><div><dt>Location</dt><dd>${esc(f.path || "—")}</dd></div>` +
    `<div><dt>Category</dt><dd>${esc(f.category || "—")}</dd></div><div><dt>Detected by</dt><dd>${esc(f.tool || "—")}</dd></div>` +
    `<div><dt>Mapping</dt><dd>${mapping}</dd></div>${vector}</dl>` +
    `<div class="fb"><span class="eyebrow">Description</span><p>${esc(f.description)}</p></div>` +
    `<div class="fb"><span class="eyebrow">Evidence &amp; validation (masked)</span><pre class="evidence">${evidence}</pre></div>` +
    `<div class="fb"><span class="eyebrow">Impact</span><p>${esc(f.impact)}</p></div>` +
    `<div class="remediate"><span class="eyebrow">Remediation</span><p>${esc(f.remediation)}</p></div>${note}</div></div>`
  );
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
    `<div class="tw"><table><thead><tr><th>Request</th><th>Reason</th></tr></thead><tbody>${blockedRows}</tbody></table></div>` +
    `<div class="eyebrow" style="margin:14px 0 8px">Human approvals · ${a.decisions.length}</div>` +
    `<div class="tw"><table><thead><tr><th>Risk</th><th>Action</th><th>Target</th><th>Decision</th><th>Analyst</th></tr></thead>` +
    `<tbody>${decisionRows}</tbody></table></div>`
  );
}

/** The complete, self-contained HTML report for one saved assessment. */
export function renderReportHtml(a: Assessment, now: Date = new Date()): string {
  const generated = now.toISOString();
  const findings = [...a.findings].sort((x, y) => sevRank(x.severity) - sevRank(y.severity) || x.id.localeCompare(y.id));
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
