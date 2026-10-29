"""Render `report.report_data()` as a standalone, print-ready HTML document: the source the PDF
report is printed from (report_pdf.py). It is not a report format of its own (the formats are
PDF, JSON and DOCX), so it has no toolbar or print button.

The headings, rows and sentences come from report_view.py, which the Word report reads too.
Every dynamic value is HTML-escaped, so tool output, AI text or an operator's reason reads as
text and can never inject markup. The document is self-contained (inline CSS, no network needed)
and prints as a one-page-first PDF. Evidence arrives already masked and stays masked.
"""

import html
import re
from typing import Any, Dict, List

from . import report_view as view

# The colored pill class of each severity, validation state and triage status.
SEV_CLASS = {"CRITICAL": "crit", "HIGH": "high", "MEDIUM": "med", "LOW": "low"}
VALIDATION_CLASS = {"CONFIRMED": "confirmed", "UNCONFIRMED": "unconfirmed",
                    "INCONCLUSIVE": "inconclusive"}
STATUS_CLASS = {"open": "open", "fixed": "fixed", "accepted": "accepted",
                "false-positive": "falsepos"}


def esc(value: Any) -> str:
    """Escape one line of text, collapsing runs of whitespace (for inline copy)."""
    return html.escape(" ".join(str(value).split()), quote=True)


def esc_pre(value: Any) -> str:
    """Escape text but keep its spacing, for evidence shown in a <pre> block."""
    return html.escape(str(value), quote=True)


def esc_run(value: Any) -> str:
    """Escape a piece of a sentence: runs of whitespace become one space, the edges kept."""
    return html.escape(re.sub(r"\s+", " ", str(value)), quote=True)


def _heading(number: str, tag: str = "") -> str:
    """A numbered section's heading bar (report_view.SECTIONS)."""
    extra = f'<span class="tag">{esc(tag)}</span>' if tag else ""
    return (f'<div class="sh"><span class="no">{number}</span>'
            f'<h2>{esc(view.section(number))}</h2>{extra}</div>')


def _pill(severity: str) -> str:
    sev = severity.upper()
    return f'<span class="sev {SEV_CLASS.get(sev, "info")}">{esc(sev.title())}</span>'


def _validation(state: str) -> str:
    cls = VALIDATION_CLASS.get(state.upper(), "inconclusive")
    return f'<span class="val {cls}">{esc(state.title())}</span>'


def _status(finding: Dict[str, Any]) -> str:
    state = finding.get("status") or "open"
    return (f'<span class="st {STATUS_CLASS.get(state, "open")}">'
            f'{esc(view.status_label(finding))}</span>')


# --- the fixed stylesheet (no f-string: it is full of braces) --------------------------------
CSS = """
*{box-sizing:border-box}
:root{
  --paper:#fff; --ink:#141a24; --ink-soft:#434d5c; --muted:#7c8699; --faint:#a4adbd;
  --line:#e3e7ec; --zebra:#f6f8fa;
  --navy-1:#17305a; --navy-2:#0e1f3e; --navy-ink:#eaf1fb; --navy-label:#8db0e2;
  --rule:#2f6fd0; --accent:#1f5fc0; --ok:#1c8650;
  --crit:#911a3c; --high:#d9492a; --med:#c7920f; --low:#2a9657; --info:#596573;
  --crit-wash:#f8e3ea; --high-wash:#fbe6de; --med-wash:#f8efd5;
  --low-wash:#e3f3ea; --info-wash:#eceff2; --ok-wash:#e1f2e9;
}
html,body{margin:0}
body{background:#eceef2; color:var(--ink); font-size:12.5px; line-height:1.5;
  font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0; line-height:1.15}
p{margin:0}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
a{color:var(--accent); text-decoration:none}

.doc{max-width:860px; margin:0 auto; padding:26px 18px 70px;
  display:flex; flex-direction:column; gap:18px}
.sheet{background:var(--paper); border:1px solid var(--line); border-radius:12px;
  box-shadow:0 1px 2px rgba(18,26,40,.06),0 14px 40px rgba(18,26,40,.10);
  padding:34px; display:flex; flex-direction:column; gap:16px}

.mast{background:linear-gradient(140deg,var(--navy-1),var(--navy-2));
  color:var(--navy-ink); border-radius:11px; padding:30px}
.mast .eye{color:var(--navy-label); font-weight:600; font-size:12px; letter-spacing:.34em}
.mast h1{color:#fff; font-size:34px; font-weight:700; letter-spacing:-.015em; margin-top:10px}
.mast .sub{color:#b9cdea; font-size:14px; margin-top:7px}
.mast .tgt{margin-top:16px; display:inline-block; font-size:14px; color:#fff;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.22);
  border-radius:8px; padding:7px 12px; word-break:break-all}
.mast dl{margin:20px 0 0; display:grid; grid-template-columns:1fr 1fr;
  gap:13px 28px; max-width:560px}
.mast dt{color:var(--navy-label); font-size:9.5px; letter-spacing:.11em; text-transform:uppercase}
.mast dd{margin:2px 0 0; color:#fff; font-weight:600; font-size:13px}
.conf{margin-top:20px; display:inline-flex; align-items:center; gap:8px;
  border:1px solid #d08aa0; color:#ffd7e2; border-radius:999px; padding:6px 14px;
  font-size:11px; font-weight:600; letter-spacing:.08em}

.sh{display:flex; align-items:baseline; gap:10px; border-bottom:2.5px solid var(--rule);
  padding-bottom:5px}
.sh h2{font-size:15px; font-weight:700}
.sh .no{font-family:"IBM Plex Mono"; color:var(--accent); font-weight:600; font-size:13px}
.sh .tag{margin-left:auto; font-size:10px; color:var(--muted); font-family:"IBM Plex Mono";
  text-transform:uppercase; letter-spacing:.07em}
.block{display:flex; flex-direction:column; gap:10px}
.summary{font-size:12.5px; color:var(--ink-soft)}
.summary b{color:var(--ink)}
.eyebrow{font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--muted);
  font-weight:600}
.note{font-size:11px; color:var(--muted)} .note b{color:var(--ink-soft)}

.sev{display:inline-block; font-family:"IBM Plex Mono"; font-weight:600; font-size:10px;
  letter-spacing:.06em; color:#fff; border-radius:999px; padding:2px 9px}
.sev.crit{background:var(--crit)} .sev.high{background:var(--high)}
.sev.med{background:var(--med)} .sev.low{background:var(--low)} .sev.info{background:var(--info)}
.val{display:inline-block; font-family:"IBM Plex Mono"; font-weight:600; font-size:10px;
  letter-spacing:.04em; border-radius:999px; padding:2px 9px; border:1px solid currentColor}
.val.confirmed{color:var(--ok)} .val.unconfirmed{color:var(--med)}
.val.inconclusive{color:var(--info)}
.st{display:inline-block; font-family:"IBM Plex Mono"; font-size:10px; font-weight:600;
  letter-spacing:.04em; border-radius:999px; padding:2px 8px; border:1px solid currentColor}
.st.open{color:var(--muted)} .st.fixed{color:var(--ok)}
.st.accepted{color:var(--med)} .st.falsepos{color:var(--info)}

.grid2{display:grid; grid-template-columns:1.15fr 1fr; gap:18px; align-items:start}
.tiles{display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--line);
  border:1px solid var(--line); border-radius:10px; overflow:hidden}
.tile{background:var(--paper); padding:10px 6px; text-align:center}
.tile .n{font-family:"IBM Plex Mono"; font-weight:600; font-size:24px; line-height:1}
.tile .k{margin-top:5px; font-size:9px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--muted)}
.tile.crit .n{color:var(--crit)} .tile.high .n{color:var(--high)}
.tile.med .n{color:var(--med)} .tile.low .n{color:var(--low)}
.tile.tot .n{color:var(--accent)} .tile.ok .n{color:var(--ok)}
.dist{display:flex; height:22px; border-radius:6px; overflow:hidden; border:1px solid var(--line)}
.dist i{display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;
  font-weight:600; font-family:"IBM Plex Mono"}
.dist .crit{background:var(--crit)} .dist .high{background:var(--high)}
.dist .med{background:var(--med)} .dist .low{background:var(--low)}
.legend{display:flex; flex-wrap:wrap; gap:5px; margin-top:9px}

.tw{overflow-x:auto; border:1px solid var(--line); border-radius:10px}
table{border-collapse:collapse; width:100%; font-size:11.5px}
th,td{text-align:left; padding:6px 11px; border-bottom:1px solid var(--line); vertical-align:top}
thead th{background:var(--zebra); font-size:9.5px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--muted); font-weight:600}
tbody tr:last-child td{border-bottom:none}
td.id{font-family:"IBM Plex Mono"; font-weight:600; color:var(--accent); white-space:nowrap}

.kv{display:grid; grid-template-columns:150px 1fr; gap:8px 18px; font-size:12px}
.kv dt{color:var(--muted)} .kv dd{margin:0; color:var(--ink-soft)}
.chips{display:flex; flex-wrap:wrap; gap:6px}
.chip{font-family:"IBM Plex Mono"; font-size:11px; padding:2px 9px; border-radius:7px;
  background:#eaf1fb; color:var(--accent)}
.chip.block{background:var(--crit-wash); color:var(--crit)}
.chip.plain{background:var(--info-wash); color:var(--ink-soft)}
.disclaimer{color:var(--ink-soft); font-size:11.5px; background:var(--zebra);
  border:1px solid var(--line); border-radius:9px; padding:12px 14px}

.find{border:1px solid var(--line); border-radius:11px; overflow:hidden; break-inside:avoid}
.find+.find{margin-top:14px}
.find-head{display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:11px 15px;
  border-bottom:1px solid var(--line); border-left:4px solid var(--line)}
.find.s-crit .find-head{border-left-color:var(--crit)}
.find.s-high .find-head{border-left-color:var(--high)}
.find.s-med .find-head{border-left-color:var(--med)}
.find.s-low .find-head{border-left-color:var(--low)}
.find.s-info .find-head{border-left-color:var(--info)}
.find-id{font-family:"IBM Plex Mono"; font-weight:600; color:var(--muted); font-size:12px}
.find-head h3{font-size:14.5px; font-weight:600; flex:1 1 220px; min-width:0}
.find-cvss{font-family:"IBM Plex Mono"; font-size:11px; color:var(--ink-soft);
  background:var(--zebra); border:1px solid var(--line); border-radius:7px; padding:2px 8px}
.find-body{padding:14px 15px; display:grid; gap:12px}
.find-meta{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
  background:var(--line); border:1px solid var(--line); border-radius:9px; overflow:hidden}
.find-meta div{background:var(--paper); padding:8px 11px}
.find-meta dt{font-size:9px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted)}
.find-meta dd{margin:3px 0 0; font-family:"IBM Plex Mono"; font-size:11.5px; word-break:break-all}
.fb{display:grid; gap:4px}
.fb .eyebrow{color:var(--accent)}
.evidence{font-family:"IBM Plex Mono"; font-size:11.5px; line-height:1.65; background:var(--zebra);
  border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:8px;
  padding:11px 13px; margin:0; overflow-x:auto; white-space:pre-wrap; word-break:break-word}
.remediate{background:var(--ok-wash); border:1px solid rgba(28,134,80,.3); border-radius:8px;
  padding:11px 13px}
.remediate .eyebrow{color:var(--ok)}

.pfoot{border-top:1px solid var(--line); padding-top:10px; display:flex;
  justify-content:space-between; gap:10px; flex-wrap:wrap; color:var(--faint); font-size:10px;
  font-family:"IBM Plex Mono"; text-transform:uppercase; letter-spacing:.06em}

@media (max-width:640px){
  .grid2{grid-template-columns:1fr} .mast dl{grid-template-columns:1fr}
  .kv{grid-template-columns:1fr}
}
@media print{
  @page{size:A4; margin:8mm}
  body{background:#fff; font-size:8.7pt; line-height:1.42}
  .doc{max-width:none; margin:0; padding:0; gap:0}
  .sheet{border:none; border-radius:0; box-shadow:none; padding:0; gap:9px}
  .sheet+.sheet{margin-top:0; break-before:page}
  .block{gap:7px}
  .mast{border-radius:8px; padding:13px 15px}
  .mast h1{font-size:20pt} .mast .sub{font-size:9.5pt}
  .mast .tgt{margin-top:10px; padding:5px 10px}
  .mast dl{margin-top:11px; gap:7px 22px}
  .summary{line-height:1.4}
  .disclaimer{padding:8px 11px}
  .find-body{gap:8px} .find+.find{margin-top:10px} .evidence{padding:8px 11px}
  th,td{padding:3px 9px}
  .pfoot{padding-top:7px}
  .find,tr{break-inside:avoid}
  *{-webkit-print-color-adjust:exact; print-color-adjust:exact}
}
"""

def _masthead(data: Dict[str, Any]) -> str:
    items = "".join(f"<div><dt>{esc(label)}</dt><dd>{esc(value)}</dd></div>"
                    for label, value in view.cover_rows(data))
    return (
        '<header class="mast">'
        '<div class="eye">RECONIX</div>'
        f'<h1>{esc(view.TITLE)}</h1>'
        f'<div class="sub">{esc(view.subtitle(data))}</div>'
        f'<div class="tgt mono">{esc(data.get("target") or "—")}</div>'
        f'<dl>{items}</dl>'
        f'<div class="conf">&#128274; {esc(view.CONFIDENTIAL)}</div>'
        '</header>'
    )


def _severity_block(findings: List[Dict[str, Any]]) -> str:
    tiles = "".join(
        f'<div class="tile {SEV_CLASS.get(label.upper(), "tot")}"><div class="n">{n}</div>'
        f'<div class="k">{esc(label)}</div></div>'
        for label, n in view.count_columns(findings)
    )
    present = view.distribution(findings)
    segs = "".join(
        f'<i class="{SEV_CLASS[sev]}" style="width:{pct}%">{pct}%</i>' for sev, _n, pct in present
    )
    legend = "".join(f'<span class="sev {SEV_CLASS[sev]}">{n} {esc(sev.title())}</span>'
                     for sev, n, _pct in present)
    return (
        '<div class="grid2">'
        f'<div class="tiles">{tiles}</div>'
        '<div><div class="eyebrow" style="margin-bottom:7px">Severity distribution</div>'
        f'<div class="dist">{segs}</div>'
        f'<div class="legend">{legend}</div></div>'
        '</div>'
    )


def _summary_narrative(data: Dict[str, Any]) -> str:
    sentence = "".join(f"<b>{esc_run(text)}</b>" if bold else esc_run(text)
                       for text, bold in view.summary(data))
    return f'<p class="summary">{sentence}</p>'


def _findings_table(findings: List[Dict[str, Any]]) -> str:
    rows = "".join(
        f'<tr><td class="id">{esc(f["id"])}</td><td>{esc(f["title"])}</td>'
        f'<td>{_pill(f["severity"])}</td><td class="mono">{view.cvss(f)}</td>'
        f'<td>{_status(f)}</td>'
        f'<td>{esc(f.get("category") or "—")}</td></tr>'
        for f in view.ordered(findings)
    )
    if not rows:
        rows = f'<tr><td colspan="6">{esc(view.NO_FINDINGS_ROW)}</td></tr>'
    head = "".join(f"<th>{esc(h)}</th>" for h in view.FINDINGS_HEAD)
    return (
        '<div class="tw"><table>'
        f'<thead><tr>{head}</tr></thead>'
        f'<tbody>{rows}</tbody></table></div>'
    )


def _retest_block(data: Dict[str, Any]) -> str:
    """A 'changes since last assessment' panel, only when there is a previous run."""
    rt = data.get("retest")
    if not rt:
        return ""
    counts = rt["counts"]
    tiles = (
        f'<div class="tile high"><div class="n">{counts["new"]}</div>'
        '<div class="k">New</div></div>'
        f'<div class="tile ok"><div class="n">{counts["resolved"]}</div>'
        '<div class="k">Resolved</div></div>'
        f'<div class="tile med"><div class="n">{counts["recurring"]}</div>'
        '<div class="k">Recurring</div></div>'
    )
    new_list = ", ".join(esc(item["title"]) for item in rt["new"])
    caption = (f'<p class="note">New this run: {new_list}.</p>' if new_list else "")
    return (
        '<section class="block"><div class="sh"><span class="no">+</span>'
        f'<h2>{esc(view.RETEST_HEADING)}</h2>'
        f'<span class="tag">vs {esc(rt["previous_label"])}</span></div>'
        f'<div class="tiles" style="grid-template-columns:repeat(3,1fr)">{tiles}</div>'
        f'{caption}</section>'
    )


def _scope_block(data: Dict[str, Any]) -> str:
    scope = data["scope"]
    standards = esc(" · ".join(data.get("methodology", [])) or "—")
    approved = ('<span class="val confirmed">Approved</span>' if scope.get("approved")
                else '<span class="val inconclusive">Not approved</span>')
    excluded = "".join(f'<span class="chip block">{esc(p)}</span>'
                       for p in scope.get("excluded_paths", [])) or '<span class="note">none</span>'
    actions = "".join(f'<span class="chip">{esc(a)}</span>'
                      for a in scope.get("allowed_actions", []))
    methods = "".join(f'<span class="chip">{esc(m)}</span>'
                      for m in scope.get("allowed_methods", []))
    tools = "".join(f'<span class="chip plain">{esc(t)}</span>' for t in scope.get("tools", []))
    ports = "".join(f'<span class="chip">{esc(p)}</span>'
                    for p in scope.get("allowed_ports", []))
    ports_row = (f'<dt>Allowed ports</dt><dd><div class="chips">{ports}</div></dd>'
                 if ports else "")
    return (
        '<dl class="kv">'
        f'<dt>Approval status</dt><dd>{approved}</dd>'
        f'<dt>Standards</dt><dd>{standards}</dd>'
        f'<dt>Allowed actions</dt><dd><div class="chips">{actions}</div></dd>'
        f'<dt>Allowed methods</dt><dd><div class="chips">{methods}</div></dd>'
        f'<dt>Excluded paths</dt><dd><div class="chips">{excluded}</div></dd>'
        + ports_row +
        f'<dt>Time limit</dt><dd>{esc(scope.get("time_limit_minutes", 0))} minutes</dd>'
        f'<dt>Tools</dt><dd><div class="chips">{tools}</div></dd>'
        '</dl>'
    )


def _finding_card(finding: Dict[str, Any]) -> str:
    sev = finding["severity"].upper()
    cls = SEV_CLASS.get(sev, "info")
    score = view.cvss(finding)
    cvss_badge = f'<span class="find-cvss">CVSS {score}</span>' if score != "—" else ""
    meta = "".join(f"<div><dt>{esc(label)}</dt><dd>{esc(value)}</dd></div>"
                   for label, value in view.finding_meta(finding))
    evidence = "\n".join(esc_pre(line) for line in finding.get("evidence", [])) or "—"
    return (
        f'<div class="find s-{cls}">'
        '<div class="find-head">'
        f'<span class="find-id">{esc(finding["id"])}</span>'
        f'<h3>{esc(finding["title"])}</h3>{_pill(sev)}'
        f'{_validation(finding["validation"])}{_status(finding)}{cvss_badge}</div>'
        '<div class="find-body">'
        f'<dl class="find-meta">{meta}</dl>'
        f'<div class="fb"><span class="eyebrow">Description</span>'
        f'<p>{esc(finding.get("description"))}</p></div>'
        f'<div class="fb"><span class="eyebrow">Evidence &amp; validation (masked)</span>'
        f'<pre class="evidence">{evidence}</pre></div>'
        f'<div class="fb"><span class="eyebrow">Impact</span>'
        f'<p>{esc(finding.get("impact"))}</p></div>'
        f'<div class="remediate"><span class="eyebrow">Remediation</span>'
        f'<p>{esc(finding.get("remediation"))}</p></div>'
        + (f'<div class="fb"><span class="eyebrow">Analyst note</span>'
           f'<p>{esc(finding.get("triage_note"))}</p></div>'
           if finding.get("triage_note") else "")
        + '</div></div>'
    )


def _governance_block(data: Dict[str, Any]) -> str:
    blocked = data.get("blocked_requests", [])
    approvals = data.get("approvals", [])
    blocked_rows = "".join(
        f'<tr><td class="mono">{esc(b["request"])}</td><td>{esc(b["reason"])}</td></tr>'
        for b in blocked
    ) or f'<tr><td colspan="2">{esc(view.NO_BLOCKED)}</td></tr>'
    approval_rows = "".join(
        f'<tr><td>{_pill(a["risk"])}</td><td>{esc(a["action"])}</td>'
        f'<td class="mono">{esc(a["target"])}</td><td>{_validation(a["decision"])}</td>'
        f'<td>{esc(a.get("operator") or "—")}</td></tr>'
        for a in approvals
    ) or f'<tr><td colspan="5">{esc(view.NO_APPROVALS)}</td></tr>'
    return (
        f'<div class="eyebrow" style="margin-bottom:8px">Blocked by policy · {len(blocked)}</div>'
        '<div class="tw"><table><thead><tr><th>Request</th><th>Reason</th></tr></thead>'
        f'<tbody>{blocked_rows}</tbody></table></div>'
        '<div class="eyebrow" style="margin:14px 0 8px">'
        f'Human approvals · {len(approvals)}</div>'
        '<div class="tw"><table><thead><tr><th>Risk</th><th>Action</th><th>Target</th>'
        '<th>Decision</th><th>Analyst</th></tr></thead>'
        f'<tbody>{approval_rows}</tbody></table></div>'
    )


def render_html(data: Dict[str, Any]) -> str:
    """Return a complete, self-contained HTML report document for `data`."""
    findings = data.get("findings", [])
    cards = ("".join(_finding_card(f) for f in view.ordered(findings))
             or '<p class="note">No findings.</p>')
    engagement = esc(data.get("assessment_id") or "—")
    first_foot, last_foot = view.footers(data)
    body = (
        '<main class="doc">'

        # --- page 1: executive one-pager ---
        '<section class="sheet">'
        + _masthead(data) +
        f'<p class="note"><b>Generated by Reconix.</b> {esc(view.GENERATED_NOTE)}</p>'
        '<section class="block">' + _heading("1")
        + _summary_narrative(data)
        + _severity_block(findings) +
        '</section>'
        '<section class="block">' + _heading("2", f"{len(findings)} findings")
        + _findings_table(findings) +
        '</section>'
        + _retest_block(data) +
        '<section class="block">' + _heading("3")
        + _scope_block(data) +
        f'<div class="disclaimer">{esc(view.DISCLAIMER)}</div>'
        '</section>'
        f'<div class="pfoot"><span>{esc(view.FOOTER_TOOL)}</span>'
        f'<span>{esc(first_foot)}</span></div>'
        '</section>'

        # --- page 2+: detailed findings ---
        '<section class="sheet">'
        '<section class="block">' + _heading("4") +
        f'{cards}</section>'
        '<section class="block">' + _heading("5", "Audit trail")
        + _governance_block(data) +
        '</section>'
        f'<div class="pfoot"><span>Reconix — Confidential</span>'
        f'<span>{esc(last_foot)}</span></div>'
        '</section>'

        '</main>'
    )
    return (
        "<!doctype html>\n"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>Reconix Report — {engagement}</title>'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">'
        f"<style>{CSS}</style></head><body>{body}</body></html>\n"
    )
