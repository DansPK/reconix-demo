/* The combined report (CombinedReport, select.ts) as one self-contained HTML document, in the
   style of the single report (../html.ts: the same stylesheet, pills and severity block, so the
   two look alike). Ten numbered sections, each on its own sheet, with a page break between them
   when printed; the table of contents links to each by its anchor.

   Every value is HTML-escaped, the document carries no scripts, and the evidence it shows was
   masked before it was saved. */
import type { Severity } from "@/lib/data/schema";

import { chips, CSS, esc, escPre, META_CSP, pill, sevClass, severityBlock, shortDate, status, title, validation } from "../html";
import type { CombinedReport, Limitation, Occurrence, Priority, RunSection, UniqueFinding } from "./select";

/* --- additions to the single report's stylesheet ------------------------------------------ */
const EXTRA_CSS = `
.toc{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:6px 24px}
.toc li{display:flex; gap:10px; align-items:baseline; border-bottom:1px dotted var(--line); padding:4px 0}
.toc .no{font-family:"IBM Plex Mono"; color:var(--accent); font-weight:600; font-size:12px; width:18px}
.toc a{color:var(--ink)}
.run{font-family:"IBM Plex Mono"; font-size:10.5px; color:var(--accent); background:var(--chip-wash); border-radius:6px; padding:1px 7px; white-space:nowrap}
.runs{display:flex; flex-wrap:wrap; gap:4px}
td .run{white-space:normal}
.nw{white-space:nowrap}
.sub-h{font-size:13px; font-weight:600; color:var(--ink); margin-top:6px}
.occ{border:1px solid var(--line); border-radius:9px; padding:10px 12px; display:grid; gap:8px}
.occ+.occ{margin-top:8px}
.occ-head{display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px}
.occ-head b{font-family:"IBM Plex Mono"}
.prio{list-style:none; margin:0; padding:0; display:grid; gap:8px}
.prio li{display:grid; grid-template-columns:30px 1fr; gap:10px; border:1px solid var(--line); border-radius:9px; padding:10px 12px}
.prio .rank{font-family:"IBM Plex Mono"; font-weight:600; color:var(--accent); font-size:16px}
.prio .ttl{font-weight:600; font-size:13px; display:flex; gap:8px; align-items:center; flex-wrap:wrap}
.prio .meta{font-size:11px; color:var(--muted); margin-top:2px}
.lim{margin:0; padding-left:18px; display:grid; gap:4px; font-size:12px; color:var(--ink-soft)}
.cols{display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start}
.mast .tgt+.tgt{margin-left:6px}
@media (max-width:640px){ .toc{grid-template-columns:1fr} .cols{grid-template-columns:1fr} }
@media print{ .occ+.occ{margin-top:6px} .occ,.prio li{break-inside:avoid} }
`;

const SECTIONS = [
  ["cover", "Cover"],
  ["contents", "Table of contents"],
  ["summary", "Executive summary"],
  ["overview", "Assessment overview"],
  ["findings", "Combined findings summary"],
  ["runs", "Individual assessment sections"],
  ["evidence", "Evidence & technical details"],
  ["priorities", "Risk & remediation priorities"],
  ["limitations", "Limitations"],
  ["appendix", "Appendix & references"],
] as const;

const score = (cvss: number | null) => (cvss === null ? "—" : cvss.toFixed(1));
const runTags = (runs: string[]) => `<span class="runs">${runs.map((r) => `<span class="run">${esc(r)}</span>`).join("")}</span>`;
const sectionHead = (n: number, name: string, tag = "") =>
  `<div class="sh"><span class="no">${n}</span><h2>${esc(name)}</h2>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>`;
const sheet = (id: string, body: string) => `<section class="sheet" id="${id}">${body}</section>`;
const foot = (left: string, right: string) => `<div class="pfoot"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;
const kv = (rows: { label: string; value: string }[]) =>
  `<dl class="kv">${rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("")}</dl>`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* --- sections ------------------------------------------------------------------------------ */
function cover(r: CombinedReport, generated: string): string {
  const { cover: c, summary: s } = r;
  const window = c.from && c.to ? (shortDate(c.from) === shortDate(c.to) ? shortDate(c.from) : `${shortDate(c.from)} → ${shortDate(c.to)}`) : "—";
  const rows: [string, string][] = [
    ["Assessments combined", String(s.runs)],
    ["Assessment window", window],
    ["Operators", c.operators.join(", ") || "—"],
    ["Templates", c.templates.join(", ") || "—"],
    ["Report date", shortDate(generated)],
    ["Unique findings", `${s.unique} (${plural(s.occurrences, "occurrence")})`],
  ];
  if (c.clients.length) rows.splice(2, 0, ["Client", c.clients.join(", ")]);
  const targets = c.targets.map((t) => `<div class="tgt mono">${esc(t)}</div>`).join("");
  const items = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  return (
    `<header class="mast"><div class="eye">RECONIX</div><h1>${esc(r.title)}</h1>` +
    `<div class="sub">AI-Assisted Authorized Penetration Tests — ${plural(s.runs, "run")} in one report</div>${targets}<dl>${items}</dl>` +
    `<div class="conf">&#128274; CONFIDENTIAL — AUTHORIZED RECIPIENTS ONLY</div></header>` +
    `<p class="note"><b>Generated by Reconix.</b> This report combines the saved copies of ${plural(s.runs, "assessment")}; every number` +
    ` counts what those copies hold. Credentials and one-time codes are never stored or shown, and evidence is masked at the source.</p>` +
    `<div class="block"><div class="eyebrow">Runs in this report</div><div class="tw"><table><thead><tr><th>Run</th><th>Template</th>` +
    `<th>Target</th><th>Status</th><th>Saved copy</th></tr></thead><tbody>${c.runs
      .map((x) => `<tr><td class="id">${esc(x.id)}</td><td>${esc(x.template)}</td><td class="mono">${esc(x.target)}</td><td>${esc(x.status)}</td><td class="mono">${esc(x.uid)}</td></tr>`)
      .join("")}</tbody></table></div></div>`
  );
}

function contents(): string {
  const items = SECTIONS.map(([id, name], i) => `<li><span class="no">${i + 1}</span><a href="#${id}">${esc(name)}</a></li>`).join("");
  return `${sectionHead(2, "Table of contents")}<ol class="toc">${items}</ol>`;
}

function statusTiles(r: CombinedReport): string {
  const tiles = r.summary.byStatus.map((s) => `<div class="tile tot"><div class="n">${s.count}</div><div class="k">${esc(s.status)}</div></div>`).join("");
  return `<div class="eyebrow" style="margin-bottom:7px">Runs by status</div><div class="tiles" style="grid-template-columns:repeat(${r.summary.byStatus.length || 1},1fr)">${tiles}</div>`;
}

function summary(r: CombinedReport): string {
  const s = r.summary;
  const breakdown =
    (Object.keys(s.uniqueBySeverity) as Severity[])
      .filter((k) => s.uniqueBySeverity[k])
      .map((k) => `${s.uniqueBySeverity[k]} ${title(k)}`)
      .join(", ") || "no findings";
  const top = s.topRisks[0];
  const lead = top ? `, led by <b>${esc(top.title)}</b> (seen in ${plural(top.runs.length, "run")})` : "";
  const targets = plural(r.cover.targets.length, "target");
  const approval =
    s.scopesApproved === s.runs
      ? " Every run tested inside a scope the operator approved; intrusive actions ran only after explicit, single-use approval."
      : ` ${s.runs - s.scopesApproved} of the runs had no approved scope: see Limitations.`;
  const narrative =
    `<p class="summary">Reconix combined <b>${plural(s.runs, "assessment")}</b> of ${targets}` +
    ` (${esc(r.cover.templates.join(", ") || "—")}). Together they recorded <b>${plural(s.occurrences, "finding occurrence")}</b>, which are` +
    ` <b>${plural(s.unique, "unique finding")}</b> — ${esc(breakdown)}. The highest severity is <b>${esc(title(s.worst ?? "none"))}</b>${lead}.` +
    ` ${s.confirmed} of the unique findings ${s.confirmed === 1 ? "is" : "are"} confirmed with evidence in at least one run.${approval}</p>`;
  const risks = s.topRisks.length
    ? `<div class="tw"><table><thead><tr><th>#</th><th>Top risk</th><th>Severity</th><th>CVSS</th><th>Runs</th></tr></thead><tbody>${s.topRisks
        .map((u, i) => `<tr><td class="id">${i + 1}</td><td>${esc(u.title)}</td><td>${pill(u.severity)}</td><td class="mono">${score(u.cvss)}</td><td>${runTags(u.runs)}</td></tr>`)
        .join("")}</tbody></table></div>`
    : `<p class="note">No findings to rank.</p>`;
  return (
    `${sectionHead(3, "Executive summary")}${narrative}` +
    `<div class="eyebrow">Unique findings by severity</div>${severityBlock(r.findings)}` +
    `<div class="cols"><div>${statusTiles(r)}</div><div><div class="eyebrow" style="margin-bottom:7px">Unique vs occurrences</div>` +
    `<div class="tiles" style="grid-template-columns:1fr 1fr 1fr"><div class="tile tot"><div class="n">${s.unique}</div><div class="k">Unique</div></div>` +
    `<div class="tile tot"><div class="n">${s.occurrences}</div><div class="k">Occurrences</div></div>` +
    `<div class="tile low"><div class="n">${s.confirmed}</div><div class="k">Confirmed</div></div></div></div></div>` +
    `<div class="eyebrow">Top risks</div>${risks}`
  );
}

function overview(r: CombinedReport): string {
  const rows = r.runs
    .map((x) => {
      const window = x.startedAt ? `${shortDate(x.startedAt)}${x.finishedAt ? ` → ${shortDate(x.finishedAt)}` : " → …"}` : "—";
      const plan = x.plan.total ? `${x.plan.done}/${x.plan.total}` : "—";
      return (
        `<tr><td class="id"><a href="#run-${esc(x.uid)}">${esc(x.id)}</a></td><td>${esc(x.template)}</td><td class="mono">${esc(x.target)}</td>` +
        `<td>${esc(x.status)}</td><td class="mono nw">${esc(window)}</td><td class="mono">${x.findings.length}</td><td class="mono">${plan}</td>` +
        `<td class="mono">${x.requests}</td><td class="mono">${x.approvals.approved}/${x.approvals.total}</td></tr>`
      );
    })
    .join("");
  return (
    `${sectionHead(4, "Assessment overview", plural(r.runs.length, "run"))}` +
    `<div class="tw"><table><thead><tr><th>Run</th><th>Template</th><th>Target</th><th>Status</th><th>Window</th><th>Findings</th>` +
    `<th>Plan</th><th>Requests</th><th>Approvals</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `<p class="note">Findings count the occurrences this report includes; Approvals are the gated actions approved of those requested.</p>`
  );
}

function findingsTable(r: CombinedReport): string {
  const rows =
    r.findings
      .map(
        (u) =>
          `<tr><td>${esc(u.title)}</td><td>${pill(u.severity)}</td><td class="mono">${score(u.cvss)}</td><td class="mono nw">${esc(u.cwe ?? "—")}</td>` +
          `<td class="mono">${esc(u.target || "—")}</td><td>${validation(u.confirmed ? "CONFIRMED" : "UNCONFIRMED")}</td>` +
          `<td>${runTags(u.runs)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">No findings were recorded in these runs.</td></tr>`;
  return (
    `${sectionHead(5, "Combined findings summary", `${plural(r.summary.unique, "unique finding")} · ${plural(r.summary.occurrences, "occurrence")}`)}` +
    `<p class="note">A unique finding is the same title, weakness (CWE) and target; each run it was seen in is an occurrence.</p>` +
    `<div class="tw"><table><thead><tr><th>Finding</th><th>Severity</th><th>CVSS</th><th>CWE</th><th>Target</th><th>Validation</th><th>Seen in</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

function runScope(x: RunSection): string {
  const s = x.scope;
  if (!s) return `<div class="sub-h">Scope</div><p class="note">No Scope Manifest was saved for this run.</p>`;
  const approved = s.approved ? `<span class="val confirmed">Approved</span>` : `<span class="val inconclusive">${esc(title(s.status || "not approved"))}</span>`;
  return (
    `<div class="sub-h">Scope</div><dl class="kv"><dt>Approval status</dt><dd>${approved}</dd>` +
    `<dt>Allowed actions</dt><dd><div class="chips">${chips(s.actions)}</div></dd>` +
    `<dt>Allowed methods</dt><dd><div class="chips">${chips(s.methods)}</div></dd>` +
    `<dt>Excluded paths</dt><dd><div class="chips">${chips(s.excluded, " block") || '<span class="note">none</span>'}</div></dd>` +
    `<dt>Ports</dt><dd>${esc(s.ports.join(", ") || "default")}</dd><dt>Time limit</dt><dd>${esc(s.timeLimitMinutes)} minutes</dd>` +
    `<dt>Tools</dt><dd><div class="chips">${chips(s.tools, " plain")}</div></dd></dl>`
  );
}

function runPlan(x: RunSection): string {
  if (!x.plan.total) return `<div class="sub-h">Plan</div><p class="note">No plan was saved for this run.</p>`;
  const steps = x.plan.steps.map((p) => `<span class="chip${p.status === "done" ? "" : " plain"}">${esc(p.label)} · ${esc(p.status)}</span>`).join("");
  return `<div class="sub-h">Plan · ${x.plan.done} of ${x.plan.total} steps done</div><div class="chips">${steps}</div>`;
}

function runFindings(x: RunSection): string {
  const rows =
    x.findings
      .map(
        (o) =>
          `<tr><td class="id">${esc(o.id)}</td><td>${esc(o.title)}</td><td>${pill(o.severity)}</td><td class="mono">${score(o.cvss)}</td>` +
          `<td>${validation(o.validation)}</td><td>${status(o)}</td><td>${esc(o.tool || "—")}</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">${x.finished ? "This run completed and recorded no findings." : "No findings in this report for this run."}</td></tr>`;
  return (
    `<div class="sub-h">Findings · ${x.findings.length}</div><div class="tw"><table><thead><tr><th>ID</th><th>Finding</th><th>Severity</th>` +
    `<th>CVSS</th><th>Validation</th><th>Status</th><th>Tool</th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

function runSections(r: CombinedReport): string {
  const blocks = r.runs
    .map((x, i) => {
      const missing = x.missing.length ? `<p class="note">Not saved for this run: <b>${esc(x.missing.join(", "))}</b>.</p>` : "";
      const governance =
        `<div class="sub-h">Policy &amp; approvals</div><p class="summary">${x.blocked} out-of-scope request(s) were blocked by policy;` +
        ` ${x.approvals.approved} gated action(s) approved, ${x.approvals.rejected} rejected` +
        `${x.approvals.pending ? `, ${x.approvals.pending} still waiting` : ""} (${x.approvals.total} requested).</p>`;
      return (
        `<section class="block" id="run-${esc(x.uid)}"><div class="sh"><span class="no">6.${i + 1}</span><h2>${esc(x.id)} — ${esc(x.template)}</h2>` +
        `<span class="tag">${esc(x.uid)}</span></div>${kv(x.details)}${missing}${runScope(x)}${runPlan(x)}${governance}${runFindings(x)}</section>`
      );
    })
    .join("");
  return `${sectionHead(6, "Individual assessment sections", plural(r.runs.length, "run"))}${blocks}`;
}

function occurrenceCard(o: Occurrence, withEvidence: boolean): string {
  const evidence = withEvidence
    ? `<div class="fb"><span class="eyebrow">Evidence &amp; validation (masked)</span><pre class="evidence">${o.evidence.map(escPre).join("\n") || "—"}</pre></div>`
    : "";
  const vector = o.cvssVector ? `<div><dt>CVSS vector</dt><dd>${esc(o.cvssVector)}</dd></div>` : "";
  const note = o.note ? `<div class="fb"><span class="eyebrow">Analyst note</span><p>${esc(o.note)}</p></div>` : "";
  return (
    `<div class="occ"><div class="occ-head"><span class="run">${esc(o.runId)}</span><b>${esc(o.id)}</b>` +
    `${pill(o.severity)}${validation(o.validation)}${status(o)}<span class="find-cvss">CVSS ${score(o.cvss)}</span></div>` +
    `<dl class="find-meta"><div><dt>Saved copy</dt><dd>${esc(o.uid)}</dd></div><div><dt>Location</dt><dd>${esc(o.location || "—")}</dd></div>` +
    `<div><dt>Detected by</dt><dd>${esc(o.tool || "—")}</dd></div><div><dt>Mapping</dt><dd>${esc(o.references.join(", ") || "—")}</dd></div>${vector}</dl>` +
    `<div class="fb"><span class="eyebrow">Description</span><p>${esc(o.description)}</p></div>${evidence}` +
    `<div class="fb"><span class="eyebrow">Impact</span><p>${esc(o.impact)}</p></div>${note}</div>`
  );
}

function uniqueCard(u: UniqueFinding, withEvidence: boolean): string {
  return (
    `<div class="find s-${sevClass(u.severity)}"><div class="find-head"><h3>${esc(u.title)}</h3>${pill(u.severity)}` +
    `${validation(u.confirmed ? "CONFIRMED" : "UNCONFIRMED")}<span class="find-cvss">CVSS ${score(u.cvss)}</span></div>` +
    `<div class="find-body"><dl class="find-meta"><div><dt>Target</dt><dd>${esc(u.target || "—")}</dd></div><div><dt>Weakness</dt><dd>${esc(u.cwe ?? "—")}</dd></div>` +
    `<div><dt>Category</dt><dd>${esc(u.category || "—")}</dd></div><div><dt>Seen in</dt><dd>${esc(u.runs.join(", "))}</dd></div></dl>` +
    `<div class="eyebrow">${plural(u.occurrences.length, "occurrence")}</div>${u.occurrences.map((o) => occurrenceCard(o, withEvidence)).join("")}` +
    `<div class="remediate"><span class="eyebrow">Remediation</span><p>${esc(u.remediation)}</p></div></div></div>`
  );
}

function evidenceSection(r: CombinedReport): string {
  const note = r.options.evidence ? "" : `<p class="note">Evidence lines were left out by the report's options.</p>`;
  const cards = r.findings.map((u) => uniqueCard(u, r.options.evidence)).join("") || `<p class="note">No findings.</p>`;
  return `${sectionHead(7, "Evidence & technical details", plural(r.summary.unique, "unique finding"))}${note}${cards}`;
}

function priorities(items: Priority[]): string {
  const list = items
    .map(
      (p) =>
        `<li><span class="rank">${p.rank}</span><div><div class="ttl">${esc(p.title)}${pill(p.severity)}<span class="find-cvss">CVSS ${score(p.cvss)}</span>` +
        `${validation(p.confirmed ? "CONFIRMED" : "UNCONFIRMED")}</div><div class="meta">${esc(p.target || "—")} · seen in ${plural(p.runs.length, "run")}: ${esc(p.runs.join(", "))}</div>` +
        `<div class="remediate" style="margin-top:8px"><span class="eyebrow">Remediation</span><p>${esc(p.remediation || "—")}</p></div></div></li>`,
    )
    .join("");
  return (
    `${sectionHead(8, "Risk & remediation priorities", plural(items.length, "item"))}` +
    `<p class="note">Ordered by the worst severity seen, then the highest CVSS, then in how many runs the finding appeared.</p>` +
    (list ? `<ol class="prio">${list}</ol>` : `<p class="note">Nothing to prioritise.</p>`)
  );
}

function limitations(items: Limitation[]): string {
  const list = items.map((l) => `<li>${esc(l.text)}</li>`).join("");
  return (
    `${sectionHead(9, "Limitations")}` +
    `<div class="disclaimer">Testing was limited to each run's approved actions, methods and time window. Requests to an excluded path` +
    ` or outside the allowed methods were refused by the policy engine rather than sent. Findings reflect only what was observed` +
    ` under these constraints, in the saved copies listed on the cover.</div>` +
    (list ? `<ul class="lim">${list}</ul>` : `<p class="note">Every run completed inside an approved scope; nothing was left out.</p>`)
  );
}

function appendix(r: CombinedReport): string {
  const a = r.appendix;
  if (!a) return `${sectionHead(10, "Appendix & references")}<p class="note">The appendix was left out by the report's options.</p>`;
  const tools = a.tools.map((t) => `<tr><td class="mono">${esc(t.name)}</td><td>${runTags(t.runs)}</td></tr>`).join("") || `<tr><td colspan="2">No tools recorded.</td></tr>`;
  const refs = a.references.map((x) => `<tr><td class="mono">${esc(x.ref)}</td><td class="mono">${x.count}</td></tr>`).join("") || `<tr><td colspan="2">No references.</td></tr>`;
  const cwes = a.weaknesses.map((x) => `<tr><td class="mono">${esc(x.cwe)}</td><td class="mono">${x.count}</td></tr>`).join("") || `<tr><td colspan="2">No CWE mapped.</td></tr>`;
  const uids = a.uids.map((u) => `<li class="mono">${esc(u)}</li>`).join("");
  return (
    `${sectionHead(10, "Appendix & references")}` +
    `<div class="cols"><div><div class="eyebrow" style="margin-bottom:7px">Tools</div><div class="tw"><table><thead><tr><th>Tool</th><th>Runs</th></tr></thead><tbody>${tools}</tbody></table></div></div>` +
    `<div><div class="eyebrow" style="margin-bottom:7px">Weaknesses (unique findings)</div><div class="tw"><table><thead><tr><th>CWE</th><th>Findings</th></tr></thead><tbody>${cwes}</tbody></table></div></div></div>` +
    `<div class="eyebrow" style="margin-top:6px">References (occurrences)</div><div class="tw"><table><thead><tr><th>Reference</th><th>Occurrences</th></tr></thead><tbody>${refs}</tbody></table></div>` +
    `<div class="eyebrow" style="margin-top:6px">Saved copies</div><ul class="lim">${uids}</ul>`
  );
}

/** The complete, self-contained HTML of a combined report. */
export function renderCombinedHtml(r: CombinedReport, now: Date = new Date()): string {
  const generated = now.toISOString();
  const tag = `${plural(r.summary.runs, "run")} · Generated ${shortDate(generated)}`;
  const sheets = [
    sheet("cover", `${cover(r, generated)}${foot("Reconix — AI-Powered Security Testing Assistant", `Confidential · ${tag}`)}`),
    sheet("contents", `<section class="block">${contents()}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("summary", `<section class="block">${summary(r)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("overview", `<section class="block">${overview(r)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("findings", `<section class="block">${findingsTable(r)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("runs", `<section class="block">${runSections(r)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("evidence", `<section class="block">${evidenceSection(r)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("priorities", `<section class="block">${priorities(r.priorities)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("limitations", `<section class="block">${limitations(r.limitations)}</section>${foot("Reconix — Confidential", tag)}`),
    sheet("appendix", `<section class="block">${appendix(r)}</section>${foot("Reconix — Confidential", `${tag} · End of report`)}`),
  ].join("");
  const body = `<main class="doc">${sheets}</main>`;
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">${META_CSP}<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Reconix Combined Report — ${plural(r.summary.runs, "run")}</title><style>${CSS}${EXTRA_CSS}</style></head><body>${body}</body></html>\n`
  );
}
