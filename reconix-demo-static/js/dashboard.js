/* Dashboard surface — static reproduction of the Reconix web dashboard. */
window.Dashboard = (function () {
  const D = window.RECONIX;
  let root, S;

  const ICON = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    assistant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/></svg>',
    assessments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    findings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
    docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M3 13h3M18 13h3M19 19l-3-2M5 19l3-2M12 2v4"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.8 2.8-2.3-2.3 2.1-3.5z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  const NAV = [["overview", "Overview"], ["assistant", "AI Assistant"], ["assessments", "Assessments"], ["findings", "Findings"], ["reports", "Reports"]];
  const SEV = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const SEVVAR = { CRITICAL: "var(--sev-critical)", HIGH: "var(--sev-high)", MEDIUM: "var(--sev-medium)", LOW: "var(--sev-low)" };

  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function maskHtml(s) { return esc(s).replace(/(•+|\(masked\))/g, '<span class="masked">$1</span>'); }

  function counts(list) { const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }; list.forEach(f => c[f.severity] !== undefined && c[f.severity]++); return c; }

  function globe() { return `<div class="globe"><div class="grid"></div></div>`; }

  function viewOverview() {
    const all = D.dashFindings;
    const c = counts(all);
    const total = all.length;
    const confirmed = all.filter(f => f.validation === "CONFIRMED").length;
    const needs = all.filter(f => f.validation !== "CONFIRMED").length;
    const max = Math.max(1, ...Object.values(c));
    const stacked = SEV.map(k => c[k] ? `<span style="background:${SEVVAR[k]};width:${(c[k] / total) * 100}%"></span>` : "").join("");
    const rows = SEV.map(k => `<div class="sev-row sev-${k.toLowerCase()}">
      <span class="badge"><span class="dot"></span>${k[0] + k.slice(1).toLowerCase()}</span>
      <span class="sr-meter"><span style="width:${(c[k] / max) * 100}%"></span></span>
      <span class="sr-n">${c[k]} · ${Math.round((c[k] / total) * 100)}%</span></div>`).join("");
    return `<div class="dash-view active" data-view="overview">
      <div class="ov-strip">
        ${statCard("Findings", ICON.bug, total, `${needs} need review`, null)}
        ${statCard("Assessment progress", ICON.gauge, "100%", "Completed", 100)}
        ${statCard("Tool execution", ICON.wrench, "4", "Nuclei · OWASP ZAP · ZAP · nmap", null)}
        ${statCard("Duration", ICON.clock, "18m", "within the 30m limit", null)}
      </div>
      <div class="ov-grid">
        <div class="dash-card ov-hero">${globe()}
          <div class="hero-txt"><h1>Assessment Operations Center</h1>
            <p>AI-planned security assessments inside an approved scope.</p>
            <div class="ask-bar" data-goview="assistant">✦ Ask about these findings…</div></div></div>
        <div class="dash-card"><h3>Findings by Severity</h3>
          <div class="sev-stacked">${stacked}</div><div class="sev-rows">${rows}</div>
          <div style="margin-top:10px;display:flex;gap:8px"><span class="badge review">${confirmed} confirmed</span><span class="badge needs">${needs} need review</span></div>
        </div>
      </div>
      <div class="ov-bottom">
        <div class="dash-card"><h3>Activity Timeline</h3><ul class="timeline">
          ${tl("11:20", "SYS", "Welcome to Reconix. Target set.")}
          ${tl("11:21", "AI", "Scope Manifest drafted · pending approval")}
          ${tl("11:22", "USER", "Scope approved · plan run")}
          ${tl("11:29", "POLICY", "Blocked: GET /admin · Path excluded")}
          ${tl("11:38", "AI", "Assessment completed. 8 findings.")}
        </ul></div>
        <div class="dash-card"><h3>Execution Timeline</h3><ul class="timeline">
          ${tl("discovery", "ZAP", "18 pages · 4 forms · 6 endpoints")}
          ${tl("scanning", "Nuclei", "3 potential issues")}
          ${tl("validation", "ZAP", "access control confirmed")}
          ${tl("analysis", "AI", "OWASP + CWE guidance retrieved")}
          ${tl("report", "SYS", "report generated")}
        </ul></div>
      </div></div>`;
  }
  function tl(at, who, text) { return `<li><span class="tl-at">${esc(at)}</span><span class="tl-who">${esc(who)}</span><span>${esc(text)}</span></li>`; }
  function statCard(label, icon, big, sub, meter) {
    return `<div class="stat-card"><div class="sc-top"><span>${esc(label)}</span>${icon}</div>
      <div class="sc-big">${esc(String(big))}</div><div class="sc-sub">${esc(sub)}</div>
      ${meter != null ? `<div class="meter"><span style="width:${meter}%"></span></div>` : ""}</div>`;
  }

  function viewAssessments() {
    const rows = D.dashRuns.map((r, i) => {
      const st = r.status.toLowerCase().replace(" ", "");
      const stcls = r.status === "Completed" ? "status-completed" : r.status === "Stopped" ? "status-stopped" : "status-awaiting";
      return `<tr data-run="${i}"><td class="mono">${esc(r.id)}</td><td>${esc(r.target)}</td><td>${esc(r.template)}</td>
        <td><span class="badge ${stcls}"><span class="dot"></span>${esc(r.status)}</span></td>
        <td>${r.progress}%</td><td>${r.findings}</td><td>${esc(r.when)}</td></tr>`;
    }).join("");
    return `<div class="dash-view active" data-view="assessments">
      <div class="chip-row"><input class="search-box" placeholder="Search runs…" />
        <span class="chip on">All</span><span class="chip">Completed</span><span class="chip">Running</span><span class="chip">Stopped</span></div>
      <div class="dash-card"><h3>Assessments <span class="mut">· ${D.dashRuns.length} runs, newest first</span></h3>
        <table class="dash-table"><thead><tr><th>ID</th><th>TARGET</th><th>TEMPLATE</th><th>STATUS</th><th>PROGRESS</th><th>FINDINGS</th><th>WHEN</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }

  function viewFindings() {
    const list = D.dashFindings;
    const sel = list[S.finding] || list[0];
    const chips = `<span class="chip on">All</span>` + SEV.map(k => `<span class="chip sev-${k.toLowerCase()}"><span class="dot" style="background:${SEVVAR[k]}"></span>${k[0] + k.slice(1).toLowerCase()}</span>`).join("");
    const items = list.map((f, i) => `<div class="fl-item ${i === S.finding ? "active" : ""}" data-fi="${i}">
      <div class="fl-top"><span class="badge sev-${f.severity.toLowerCase()}"><span class="dot"></span>${f.severity[0] + f.severity.slice(1).toLowerCase()}</span>
        <span class="fl-id">${esc(f.id)}</span></div>
      <div class="fl-title">${esc(f.title)}</div>
      <div class="fl-meta">${esc(f.tool)} · CVSS ${f.cvss_score}</div></div>`).join("");
    const refs = (sel.references || []).join(" · ");
    const ev = (sel.evidence || []).map(e => `<div>${maskHtml(e)}</div>`).join("");
    return `<div class="dash-view active" data-view="findings">
      <div class="chip-row"><input class="search-box" placeholder="Search title, ID, CWE, target…" />${chips}</div>
      <div class="fnd-split">
        <div class="fnd-list">${items}</div>
        <div class="dash-card fd-detail">
          <span class="cvss sev-${sel.severity.toLowerCase()}" style="color:var(--sev)">${sel.cvss_score}</span>
          <div style="display:flex;gap:8px;align-items:center"><span class="fl-id">${esc(sel.id)}</span>
            <span class="badge sev-${sel.severity.toLowerCase()}"><span class="dot"></span>${sel.severity[0] + sel.severity.slice(1).toLowerCase()}</span></div>
          <h2 style="font-size:18px;margin:8px 0">${esc(sel.title)}</h2>
          <dl class="dl"><dt>Target</dt><dd>${esc(sel.affected_url)}</dd><dt>Tool</dt><dd>${esc(sel.tool)}</dd>
            <dt>Weakness</dt><dd>${esc((sel.references || []).find(r => r.startsWith("CWE")) || "—")}</dd>
            <dt>Validation</dt><dd>${esc(sel.validation)}</dd></dl>
          <h4>Description</h4><p>${esc(sel.description || "")}</p>
          <h4>Impact</h4><p>${esc(sel.impact || "")}</p>
          <h4>Evidence</h4><div class="ev-tile">${ev || "—"}</div>
          <h4>Remediation</h4><p>${esc(sel.remediation || "")}</p>
          <div class="fd-foot">Validation · ${esc(sel.validation)} &nbsp; <span class="refs">${esc(refs)}</span></div>
        </div></div></div>`;
  }

  function viewReports() {
    const c = counts(D.dashFindings);
    const rows = D.dashFindings.map(f => `<tr><td class="mono">${esc(f.id)}</td>
      <td><span class="badge sev-${f.severity.toLowerCase()}"><span class="dot"></span>${f.severity[0] + f.severity.slice(1).toLowerCase()}</span></td>
      <td>${esc(f.title)}</td><td>${esc((f.references || []).find(r => r.startsWith("CWE")) || "—")}</td><td class="mono">${esc(f.tool)}</td></tr>`).join("");
    return `<div class="dash-view active" data-view="reports">
      <div class="rep-downloads"><span class="lbl">⬇ Download</span>
        <button class="dash-chip-btn" data-exp="pdf">PDF</button>
        <button class="dash-chip-btn" data-exp="json">JSON</button>
        <button class="dash-chip-btn" data-exp="docx">DOCX</button></div>
      <div class="dash-card"><h3>Security Assessment Report <span class="mut">· ${esc(D.methodology.join(" · "))}</span></h3>
        <p style="font-size:13px;color:var(--muted-foreground)">portal.example.com · Web URL · ${D.dashFindings.length} findings
          (${c.CRITICAL} critical, ${c.HIGH} high, ${c.MEDIUM} medium, ${c.LOW} low)</p>
        <table class="dash-table" style="margin-top:12px"><thead><tr><th>ID</th><th>SEVERITY</th><th>FINDING</th><th>WEAKNESS</th><th>TOOL</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }

  function viewAssistant() {
    return `<div class="dash-view active" data-view="assistant"><div class="asst-wrap">
      ${globe()}
      <h2>How can I help with this assessment?</h2>
      <p>Ask about any finding, its evidence, or how to fix it. Answers are grounded in the saved assessment data.</p>
      <div class="asst-composer"><span class="model-chip"><span class="dot"></span>reconix-sec-1</span>
        <input placeholder="Ask anything about these findings…" /><span style="color:var(--primary-strong)">➤</span></div>
      <div class="asst-qa">
        <div class="dash-card"><h3>Which finding should I fix first?</h3>
          <p style="font-size:13px;line-height:1.6">The <b>admin console reachable without authentication</b> (IMP-001, Critical) is the priority — it exposes full admin access with no credentials. Restrict it to an internal network and require authentication. Next, the <b>broken object-level authorization</b> on <code>/api/orders/{id}</code> (confirmed, OWASP A01:2021 / CWE-639).</p></div>
      </div></div></div>`;
  }

  const VIEWS = { overview: viewOverview, assessments: viewAssessments, findings: viewFindings, reports: viewReports, assistant: viewAssistant };

  function render() {
    const rail = NAV.map(([k, label]) => `<button class="dash-navbtn ${S.view === k ? "active" : ""}" data-view="${k}">${ICON[k]}<span class="tip">${label}</span></button>`).join("");
    root.innerHTML = `<div class="dash-frame">
      <div class="dash-rail">${rail}<div class="spacer"></div>
        <button class="dash-navbtn" title="Documentation">${ICON.docs}<span class="tip">Documentation</span></button></div>
      <div class="dash-bar">
        <span class="dash-pill"><span class="live"></span>live · 10s</span>
        <span class="dash-switcher">RCX-DEMO-001 <span class="mut">· portal.example.com</span> ▾</span>
        <span class="dash-chips"><span>Target <b>portal.example.com</b></span><span>Template <b>Web URL</b></span><span>Status <b>Completed</b></span><span>Findings <b>8</b></span></span>
        <input class="dash-search" placeholder="Search docs…" />
      </div>
      <div class="dash-content">${(VIEWS[S.view] || viewOverview)()}</div></div>`;
    wire();
  }

  function wire() {
    root.querySelectorAll(".dash-navbtn[data-view]").forEach(b => b.onclick = () => { S.view = b.dataset.view; render(); });
    root.querySelectorAll("[data-goview]").forEach(b => b.onclick = () => { S.view = b.dataset.goview; render(); });
    root.querySelectorAll("tr[data-run]").forEach(tr => tr.onclick = () => { S.view = "findings"; render(); });
    root.querySelectorAll(".fl-item[data-fi]").forEach(it => it.onclick = () => { S.finding = parseInt(it.dataset.fi, 10); render(); });
    root.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => exp(b.dataset.exp));
  }
  function exp(fmt) {
    if (fmt === "json") {
      const blob = new Blob([JSON.stringify({ schema: "reconix.assessment/v1", target: "https://portal.example.com", findings: D.dashFindings }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "reconix-report.json"; a.click(); URL.revokeObjectURL(a.href);
      window.App.toast("⬇ Exported JSON report");
    } else window.App.toast(`📄 Exported ${fmt.toUpperCase()} report (demo)`);
  }

  function mount(el) { root = el; S = { view: "overview", finding: 0 }; render(); }
  function goto(state) { if (state === "findings") S.view = "findings"; else if (state === "reports") S.view = "reports"; else S.view = "overview"; render(); }
  return { mount, goto };
})();
