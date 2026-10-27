/* Terminal surface — a clickable reproduction of the Reconix TUI flow.
   window.Terminal.mount(el) builds it; goto(state) is used by the guided tour. */
window.Terminal = (function () {
  const D = window.RECONIX;
  let root, body, S;

  const FLOW = ["Start", "Template", "Plan", "Approval", "Execution", "Findings", "Report"];
  // which flow label a given state sits under
  const STATE_LABEL = { start: 0, provider: 0, input: 0, scope: 1, plan: 2,
    execution: 4, login: 4, approval: 3, approvalHigh: 3, findings: 5, finding: 5, report: 6 };

  function fresh() {
    return { flow: "start", llm: null, target: null, scopeApproved: false, planRun: false,
      execDone: false, menu: null, finding: 0, convo: [], gateIndex: 0, execPhase: "idle" };
  }

  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  // ---------- chrome ----------
  function sessionBar() {
    const llm = S.llm
      ? `llm: <span style="color:var(--foreground)">${esc(S.llm.label)} · ${esc(S.llm.model)}</span> <span class="dot-on">●</span>`
      : `llm: <span class="dot-off">off</span>`;
    const tmpl = S.scopeApproved ? "Web URL" : "—";
    const tgt = S.target || "no target yet";
    return `<div class="term-sessionbar">
      <span class="brand">◆ reconix</span><span class="sep">│</span>
      <span>${S.target ? "RCX-DEMO-001" : "new session"} · ${esc(tgt)}</span>
      <span class="right">
        <span>◆ demo data</span><span>${llm}</span>
        <span>template: ${esc(tmpl)}</span><span>policy: enforced</span>
      </span></div>`;
  }
  function flowLine() {
    const cur = STATE_LABEL[S.flow] ?? 0;
    const parts = FLOW.map((lbl, i) => {
      let cls = "f-pend", g = "○";
      if (i < cur) { cls = "f-done"; g = "✓"; }
      else if (i === cur) { cls = "f-cur"; g = "●"; }
      if ((S.flow === "approval" || S.flow === "approvalHigh") && lbl === "Approval") { cls = "f-wait"; g = "!"; }
      return `<span class="${cls}">${g} ${lbl}</span>`;
    });
    return `<div class="term-flow">── ${parts.join(" ─ ")} ──</div>`;
  }

  // ---------- prompt ----------
  function promptBox(placeholder, hint) {
    return `<div class="term-prompt">
      <div class="term-suggest" id="suggest" hidden></div>
      <div class="pbox"><span class="caret">❯</span>
        <input id="prompt" autocomplete="off" spellcheck="false"
          placeholder="${esc(placeholder || "Type a target (URL, IPv4, repo or path), a question, or / for commands")}" /></div>
      <div class="term-hint" id="phint">${hint || "/ for commands · ↑ history · ^R search · ? for shortcuts"}</div>
    </div>`;
  }

  // ---------- screens ----------
  function screenStart() {
    const conv = S.convo.map(l => `<div class="term-line"><span class="who-${l.who}">${l.who === "you" ? "💬 you" : "◆ reconix"}</span>  ${esc(l.text)}</div>`).join("");
    const welcome = S.convo.length ? "" : `
      <pre class="term-logo">${D.logo.join("\n")}</pre>
      <div class="term-tag">AI-Powered Security Testing Assistant</div>
      <div class="term-ver">v0.4.0  ·  terminal interface  ·  authorized assessments only</div>
      <div class="term-quick">
        <h4>◆ Start an assessment</h4>
        <div class="q-row" data-fill="https://shop.example.com"><span class="q-n">1</span><span>Pick a template, type its target</span><span class="q-hint">/template</span></div>
        <div class="q-row" data-fill="https://shop.example.com"><span class="q-n">2</span><span>Or just type a target</span><span class="q-hint">"https://shop.example.com"</span></div>
        <div class="q-row"><span class="q-n">3</span><span>Approve scope · run plan · approve risks</span><span class="q-hint">↵ at each gate</span></div>
      </div>
      <div class="term-noscope">No active scope — type /template or a target below to begin.</div>`;
    return `<div class="term-body" id="tbody">${welcome}${conv}</div>${promptBox()}`;
  }

  function menuScreen(opts) {
    // opts: { chip, question, label(optional ai line), rows:[{label,hint,rec,tag,danger,act}] }
    const ai = opts.ai ? `<div class="term-ai-label">${esc(opts.ai)}</div>` : "";
    const rows = opts.rows.map((r, i) => `
      <div class="m-row ${i === 0 ? "active" : ""} ${r.danger ? "danger" : ""} ${r.disabled ? "disabled" : ""}" data-i="${i}">
        <span class="m-ptr">❯</span>
        <div class="m-main">
          <div class="m-label">${esc(r.label)}${r.rec ? '<span class="m-rec">(Recommended)</span>' : ""}${r.tag ? `<span class="m-tag">${esc(r.tag)}</span>` : ""}</div>
          ${r.hint ? `<div class="m-hint">${esc(r.hint)}</div>` : ""}
        </div></div>`).join("");
    return `<div class="term-body" id="tbody">${ai}
      <span class="term-chip ${opts.danger ? "danger" : ""}">${esc(opts.chip)}</span>
      <div class="term-q">${esc(opts.question)}</div>
      ${opts.pre || ""}
      <div class="term-menu" id="menu">${rows}</div>${opts.post || ""}</div>`;
  }

  function screenProvider() {
    return menuScreen({
      chip: "Providers", ai: "LLM PROVIDERS — pick a provider to set up or manage",
      question: "Pick a provider to set up or manage:",
      rows: D.providers.map(p => ({ label: p.label, hint: p.hint, rec: p.id === "reconix", act: () => setProvider(p) })),
    });
  }

  function scopePanel() {
    const may = D.scope.mayDo.map(x => `<div><span class="ok">✓</span> ${esc(x)}</div>`).join("");
    const never = D.scope.neverTouch.map(x => `<div><span class="no">✗</span> ${esc(x)}</div>`).join("");
    return `<div class="term-panel accent"><div class="p-title">⛉ SCOPE <span class="p-sub">draft · needs your approval</span></div>
      <div class="p-body">
        Reconix will test <b>${esc(D.scope.target)}</b> as a ${esc(D.scope.kind)}.
        <h5>What it may do</h5>${may}
        <h5>What it will never touch</h5>${never}
        <h5>Tools it will use</h5>${esc(D.scope.tools.join(", "))} · time limit ${D.scope.timeLimit} min
      </div></div>
      <div class="term-note">ℹ  The agent can only act inside this manifest. Anything else is blocked before a tool runs.</div>`;
  }

  function screenScope() {
    return menuScreen({
      chip: "Scope", ai: "Web URL template auto-selected · drafted a scope manifest for your approval",
      question: "Approve this scope manifest?", pre: scopePanel(),
      rows: [
        { label: "Approve scope", hint: "Lock the manifest; next you review the test plan.", rec: true, act: approveScope },
        { label: "Edit manifest", hint: "Change methods, excluded paths, ports, tools or the time limit.", act: () => toast("Edit manifest — not shown in this demo") },
        { label: "Reject", hint: "Discard this draft: nothing is tested and the assessment stops.", danger: true, act: () => { S = fresh(); render(); } },
      ],
    });
  }

  function screenPlan() {
    const rows = D.plan.map(p => `<div class="plan-row">
      <span class="plan-ph">${esc(p.phase)}</span><span class="plan-lbl">${esc(p.label)}</span>
      <span class="plan-gate risk-${p.risk.toLowerCase()}">${esc(p.gate)}</span></div>`).join("");
    return `<div class="term-body" id="tbody">
      <div class="term-ai-label">the test plan · every phase, and each risky action, before anything runs</div>
      <div class="term-panel"><div class="p-title">◆ TEST PLAN <span class="p-sub">${D.plan.length} phases · time limit ${D.scope.timeLimit} min</span></div>
        <div style="padding:2px 0">${rows}</div></div>
      <div class="term-actions">
        <button class="term-btn primary" data-act="runplan">Run plan</button>
        <button class="term-btn" data-act="editsteps">Edit steps</button>
      </div></div>`;
  }

  function execTaskRows() {
    const order = ["discovery", "scanning", "validation", "analysis", "report"];
    const done = S.execPhase === "done";
    return D.plan.map((p, i) => {
      let cls = "queued", glyph = "○", state = "queued";
      const reached = order.indexOf(S.execPhase);
      if (done || i < reached) { cls = "done"; glyph = "✓"; state = "done"; }
      else if (i === reached) { cls = "running"; glyph = "◌"; state = "running…"; }
      if (p.phase === "validation" && S.execPhase === "validation" && !S.gateOpen) { cls = "paused"; glyph = "⏸"; state = "paused · waiting for you"; }
      return `<div class="exec-task ${cls}"><span class="et-glyph">${glyph}</span><span>${esc(p.label)}</span><span class="et-state">${state}</span></div>`;
    }).join("");
  }
  function execLogHtml() {
    return S.execLines.map(l => {
      if (l.tone === "card") {
        const rows = l.rows.map(r => `<div class="lc-row"><span>${esc(r[0])}</span><span class="lc-v">${esc(r[1])}</span></div>`).join("");
        return `<div class="log-card"><div class="lc-title">${esc(l.text)}</div>${rows}</div>`;
      }
      return `<div class="term-line"><span class="who-${l.who.toLowerCase()}">${l.who}</span>  ${esc(l.text)}</div>`;
    }).join("");
  }
  function screenExecution() {
    let title = "◌ RUNNING", pcls = "accent";
    if (S.execPhase === "done") { title = "✓ COMPLETE"; pcls = "success"; }
    const done = S.execPhase === "done" ? D.plan.length : Math.max(0, ["discovery", "scanning", "validation", "analysis", "report"].indexOf(S.execPhase));
    const spinner = S.execPhase !== "done"
      ? `<div class="exec-spinner">◌ reconix is on: ${esc(S.execMsg || "running the permitted scan")} …</div>` : "";
    const cont = S.execPhase === "done"
      ? `<div class="term-actions"><button class="term-btn primary" data-act="tofindings">View findings →</button></div>` : "";
    return `<div class="term-body" id="tbody">
      <div class="term-panel ${pcls}"><div class="p-title">${title}
        <span class="p-sub">${done} of ${D.plan.length} complete · requests streaming · 1 blocked · ${S.execPhase === "done" ? D.findings.length : 0} finding(s)</span></div>
        <div class="exec-tasks">${execTaskRows()}</div>
        ${spinner}
        <div class="exec-log"><div style="font-size:11px;color:var(--muted-foreground);padding:4px 2px">▤ live output</div>${execLogHtml()}</div>
      </div>${cont}</div>`;
  }

  function screenLogin() {
    return `<div class="term-body" id="tbody">
      <div class="term-ai-label">the run needs the target login · OWASP ZAP needs a test account</div>
      <div class="term-panel accent"><div class="p-title">⏸ WAITING FOR THE TARGET LOGIN <span class="p-sub">kept in memory for this session only</span></div>
        <div class="p-body term-form">
          <label>Test account email</label><input id="lg-email" value="tester-a@example.com" />
          <label>Password</label><input id="lg-pass" type="password" value="••••••••••" />
          <label>One-time code (sent after the password)</label><input id="lg-code" placeholder="6 digits" value="418204" />
          <div class="term-actions"><button class="term-btn primary" data-act="login-submit">Sign in</button>
            <button class="term-btn" data-act="login-cancel">Cancel</button></div>
          <div class="term-note">The code is never stored. The raw password never reaches the model.</div>
        </div></div></div>`;
  }

  function screenApproval(high) {
    const g = D.approvals[high ? 1 : 0];
    return menuScreen({
      chip: "Approval", ai: `gated action ${high ? 2 : 1} of 2 requires your approval`,
      danger: high,
      question: `Run ${g.action} on ${g.target}?`,
      pre: `<div class="term-panel ${high ? "danger" : "accent"}"><div class="p-title">◆ HUMAN APPROVAL REQUIRED <span class="p-sub">◆ ${g.risk} RISK</span></div>
        <div class="p-body">
          <dl class="appr-grid">
            <dt>Action</dt><dd>${esc(g.action)}</dd>
            <dt>Target</dt><dd>${esc(g.target)} <span class="ok">✓ policy check passed</span></dd>
            <dt>Purpose</dt><dd>${esc(g.purpose)}</dd>
            <dt>Impact</dt><dd>${esc(g.impact)}</dd>
          </dl>
          <div class="appr-req"><div class="lbl">EXACT REQUEST</div>
            <div class="appr-cmd">$ ${esc(g.command)} <span class="hash">${g.hash}…</span></div></div>
        </div></div>
        <div class="term-note">logged to audit · operator: analyst</div>`,
      rows: [
        { label: "View details", hint: "Scope limits, exact request and audit trail.", act: () => toast("Details: scope limits, exact request and audit trail") },
        { label: "Approve & run", hint: high ? "HIGH risk: you double-check the exact request first." : "Runs this one request now.",
          act: () => high ? confirmHigh() : afterGate(false) },
        { label: "Reject", hint: "Not executed. The assessment stops; nothing else runs.", danger: true, act: () => { toast("Assessment stopped at the gate"); S = fresh(); render(); } },
        { label: "Edit params", hint: `Change the ${g.param} first; the policy checks it again.`, act: () => toast("Edit params — policy re-checks the new value") },
      ],
    });
  }

  function confirmHigh() {
    const g = D.approvals[1];
    body.querySelector("#tbody").insertAdjacentElement("afterbegin", h(`
      <div class="term-panel danger" style="margin-bottom:14px">
        <div class="p-title">◆ HIGH-RISK · second confirmation <span class="p-sub">◆ HIGH RISK</span></div>
        <div class="p-body">
          <div class="appr-cmd" style="margin-bottom:8px">$ ${esc(g.command)} <span class="hash">${g.hash}</span></div>
          <div><b>Purpose</b> ${esc(g.purpose)}</div><div><b>Impact</b> ${esc(g.impact)}</div>
          <div class="term-q" style="margin-top:10px">Run this HIGH-risk step now?</div>
          <div class="term-menu">
            <div class="m-row active" data-hc="no"><span class="m-ptr">❯</span><div class="m-main"><div class="m-label">No, go back</div><div class="m-hint">Nothing runs.</div></div></div>
            <div class="m-row danger" data-hc="yes"><span class="m-ptr">❯</span><div class="m-main"><div class="m-label">Yes, run ${esc(g.action)} on ${esc(g.target)}</div><div class="m-hint">Runs this one request now.</div></div></div>
          </div>
        </div></div>`));
    body.querySelector("[data-hc='no']").onclick = () => render();
    body.querySelector("[data-hc='yes']").onclick = () => afterGate(true);
    body.querySelector("#tbody").scrollTop = 0;
  }

  function screenFindings() {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    D.findings.forEach(f => counts[f.severity]++);
    const strip = Object.entries(counts).map(([k, v]) =>
      `<span class="sev-${k.toLowerCase()}"><span class="ss-sq sev-sq">■</span>${k} ${v}</span>`).join("");
    const rows = D.findings.map((f, i) => `<tr data-fi="${i}">
      <td class="fnd-id">${f.id}</td>
      <td class="sev-${f.severity.toLowerCase()}"><span class="sev-sq">■</span> ${f.severity}</td>
      <td>${esc(f.title)}</td><td>${esc(f.path)}</td><td>${esc(f.tool)}</td>
      <td>${esc(f.references.find(r => r.startsWith("CWE")) || "")}</td>
      <td class="val-${f.validation.toLowerCase()}">${f.validation === "CONFIRMED" ? "✓" : f.validation === "INCONCLUSIVE" ? "◐" : "○"} ${f.validation}</td>
      <td>${esc(f.status)}</td></tr>`).join("");
    return `<div class="term-body" id="tbody">
      <div class="sev-strip">${strip}</div>
      <table class="fnd-table"><thead><tr>
        <th>ID</th><th>SEVERITY</th><th>TITLE</th><th>PATH / COMPONENT</th><th>TOOL</th><th>CVE / CWE</th><th>VALIDATION</th><th>STATUS</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="term-hint" style="margin-top:12px">↑/↓ select · ↵ open · f filter · s sort · t triage · → report</div>
      <div class="term-actions"><button class="term-btn" data-act="toreport">Open report →</button></div></div>`;
  }

  function screenFinding() {
    const f = D.findings[S.finding];
    const ev = f.evidence.map(e => `<div>${e.replace(/(•+|\(masked\)|masked)/g, '<span class="masked">$1</span>')}</div>`).join("");
    const refs = f.references.join(" · ");
    return `<div class="term-body" id="tbody">
      <div class="term-hint">← findings / ${f.id} (${S.finding + 1} of ${D.findings.length}) · [ prev · ] next</div>
      <div class="fd-head">
        <div style="font-size:16px"><span class="sev-${f.severity.toLowerCase()}"><span class="sev-sq">■</span> ${f.severity}</span> &nbsp;${esc(f.title)}</div>
        <div class="fd-meta">${f.id} · ${esc(f.path)} · detected by ${esc(f.tool)} &nbsp;&nbsp; CVSS ${f.cvss_score} · ${esc(refs)}</div>
      </div>
      <div class="fd-cols">
        <div class="term-panel"><div class="p-title">▤ EVIDENCE <span class="p-sub">${esc(f.tool)}</span></div>
          <div class="p-body">
            <div class="fd-sec"><h5>Affected URL</h5><p>${esc(f.affected_url)}</p></div>
            <div class="fd-sec"><h5>Evidence (masked)</h5><div class="fd-ev">${ev}</div></div>
            <div class="fd-sec"><h5>Validation</h5><p class="val-${f.validation.toLowerCase()}">${f.validation}</p></div>
          </div></div>
        <div class="term-panel accent"><div class="p-title">✦ AI ANALYSIS <span class="p-sub">grounded in OWASP · CWE · NVD</span></div>
          <div class="p-body">
            <div class="fd-sec"><h5>Description</h5><p>${esc(f.description)}</p></div>
            <div class="fd-sec"><h5>Impact</h5><p>${esc(f.impact)}</p></div>
            <div class="fd-sec"><h5>Remediation</h5><p>${esc(f.remediation)}</p></div>
            <div class="fd-sec"><h5>Classification</h5><p>${esc(f.category)} · ${esc(f.cvss_vector)}</p>
              <p class="fd-refs">${esc(refs)}</p></div>
          </div></div>
      </div>
      <div class="term-actions">
        <button class="term-btn" data-act="prevf">‹ prev</button>
        <button class="term-btn" data-act="nextf">next ›</button>
        <button class="term-btn" data-act="toreport">Open report →</button>
      </div></div>`;
  }

  function screenReport() {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    D.findings.forEach(f => counts[f.severity]++);
    const max = Math.max(1, ...Object.values(counts));
    const bars = Object.entries(counts).map(([k, v]) => {
      const fill = Math.round((v / max) * 20);
      return `<div class="rep-bar sev-${k.toLowerCase()}"><span class="rb-lbl">${k}</span>
        <span class="rb-track">${"█".repeat(fill)}${"░".repeat(20 - fill)}</span><span class="rb-n">${v}</span></div>`;
    }).join("");
    const rows = D.findings.map(f => `<tr><td class="fnd-id">${f.id}</td><td>${esc(f.title)}</td>
      <td class="sev-${f.severity.toLowerCase()}">${f.severity}</td><td>${f.cvss_score}</td>
      <td class="val-${f.validation.toLowerCase()}">${f.validation}</td><td>${esc(f.status)}</td><td>${esc(f.tool)}</td></tr>`).join("");
    return `<div class="term-body" id="tbody">
      <div class="term-panel"><div class="p-title">▬ SECURITY ASSESSMENT REPORT <span class="p-sub">${esc(D.methodology.join(" · "))}</span></div>
        <div class="p-body">
          <div class="fd-sec"><h5>Executive summary</h5><p>Reconix assessed <b>${esc(D.TARGET)}</b> as a web application and found
            ${D.findings.length} issues (${counts.MEDIUM} medium, ${counts.LOW} low). One is confirmed; the rest are flagged for review.</p></div>
          <div class="fd-sec"><h5>Findings by severity</h5><div class="rep-bars">${bars}</div></div>
          <div class="fd-sec"><h5>Key findings</h5>
            <table class="fnd-table"><thead><tr><th>ID</th><th>FINDING</th><th>SEVERITY</th><th>CVSS</th><th>VALIDATION</th><th>STATUS</th><th>SOURCE</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        </div></div>
      <div class="term-actions">
        <button class="term-btn primary" data-act="exp-pdf">p · Export PDF</button>
        <button class="term-btn" data-act="exp-json">j · Export JSON</button>
        <button class="term-btn" data-act="exp-docx">w · Export DOCX</button>
        <button class="term-btn" data-act="web">/web · Open dashboard</button>
      </div></div>`;
  }

  // ---------- actions ----------
  function setProvider(p) {
    S.llm = { label: p.label, model: p.models[0] || "default-model" };
    toast(`✓ Provider saved · ${p.label}`);
    S.flow = "start"; render();
  }
  function startAssessment(target) {
    S.target = target;
    S.convo.push({ who: "you", text: target });
    S.convo.push({ who: "reconix", text: "Target identified — recommending the Web template and drafting a scope manifest." });
    S.flow = "scope"; render();
  }
  function approveScope() { S.scopeApproved = true; toast("Scope approved · assessment created"); S.flow = "plan"; render(); }
  function runPlan() { S.planRun = true; S.flow = "execution"; startExecution(); }
  function afterGate(high) {
    if (!high) { toast("MEDIUM action approved by analyst"); S.gateIndex = 1; S.gateOpen = true; S.flow = "execution"; resumeAfterMedium(); }
    else { toast("HIGH action approved after a double check"); S.gateOpen = true; S.flow = "execution"; resumeAfterHigh(); }
  }

  // execution streaming
  function startExecution() {
    S.execLines = []; S.execPhase = "discovery"; S.gateOpen = false; render();
    stream(0);
  }
  function stream(i) {
    const phases = ["discovery", "scanning", "validation", "analysis", "report"];
    // stream the pre-validation log lines (first 5 of execLog cover discovery+scan)
    const preGate = D.execLog.slice(0, 7);
    if (i < preGate.length) {
      S.execLines.push(preGate[i]);
      S.execMsg = preGate[i].text;
      if (i >= 4) S.execPhase = "scanning";
      render(); scrollBottom();
      S._t = setTimeout(() => stream(i + 1), 650);
    } else {
      // reach validation gate — pause for login
      S.execPhase = "validation";
      S.execLines.push(D.execLog[7], D.execLog[8]);
      render(); scrollBottom();
      S._t = setTimeout(() => { S.flow = "login"; render(); }, 700);
    }
  }
  function resumeAfterMedium() {
    S.execLines.push({ who: "SYS", text: "MEDIUM action approved · running baseline read", tone: "ok" });
    render(); scrollBottom();
    S._t = setTimeout(() => { S.flow = "approvalHigh"; render(); }, 700);
  }
  function resumeAfterHigh() {
    S.execLines.push({ who: "SYS", text: "HIGH action approved · running limited validation", tone: "ok" });
    D.analysisSteps.forEach((s, k) => S.execLines.push({ who: "AI", text: s, tone: "ai" }));
    render(); scrollBottom();
    S._t = setTimeout(() => { S.execPhase = "done"; S.execDone = true; render(); scrollBottom(); }, 900);
  }

  function scrollBottom() { const b = body.querySelector("#tbody"); if (b) b.scrollTop = b.scrollHeight; }

  // ---------- suggestions ----------
  function filterCommands(q) {
    return D.commands.filter(c => c[0].startsWith(q.toLowerCase()));
  }

  // ---------- render + wiring ----------
  function render() {
    let screen;
    switch (S.flow) {
      case "provider": screen = screenProvider(); break;
      case "scope": screen = screenScope(); break;
      case "plan": screen = screenPlan(); break;
      case "execution": case "login": screen = S.flow === "login" ? screenLogin() : screenExecution(); break;
      case "approval": screen = screenApproval(false); break;
      case "approvalHigh": screen = screenApproval(true); break;
      case "findings": screen = screenFindings(); break;
      case "finding": screen = screenFinding(); break;
      case "report": screen = screenReport(); break;
      default: screen = screenStart();
    }
    root.innerHTML = `<div class="term-window">
      <div class="term-chrome"><span class="term-dot r"></span><span class="term-dot y"></span><span class="term-dot g"></span>
        <span class="term-title">reconix — security assessment</span></div>
      ${sessionBar()}${flowLine()}${screen}</div>`;
    body = root.querySelector(".term-window");
    wire();
  }

  function wire() {
    const input = body.querySelector("#prompt");
    if (input) {
      input.focus();
      const suggest = body.querySelector("#suggest");
      input.addEventListener("input", () => {
        const v = input.value;
        if (v.startsWith("/")) {
          const list = filterCommands(v);
          suggest.innerHTML = list.map((c, i) => `<div class="s-row ${i === 0 ? "active" : ""}" data-cmd="${c[0]}"><span class="s-cmd">${c[0]}</span><span class="s-desc">${esc(c[1])}</span></div>`).join("");
          suggest.hidden = list.length === 0;
        } else suggest.hidden = true;
      });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); submit(input.value.trim()); }
      });
      suggest.addEventListener("click", e => {
        const r = e.target.closest(".s-row"); if (!r) return;
        input.value = r.dataset.cmd; suggest.hidden = true; submit(r.dataset.cmd);
      });
    }
    // quickstart fill
    body.querySelectorAll(".q-row[data-fill]").forEach(r => r.onclick = () => startAssessment(r.dataset.fill));
    // menu rows
    const menu = body.querySelector("#menu");
    if (menu) {
      const rows = menu.querySelectorAll(".m-row:not(.disabled)");
      rows.forEach(r => r.onclick = () => runMenu(parseInt(r.dataset.i, 10)));
    }
    // generic data-act buttons
    body.querySelectorAll("[data-act]").forEach(b => b.onclick = () => act(b.dataset.act));
    // findings table
    body.querySelectorAll("tr[data-fi]").forEach(tr => tr.onclick = () => { S.finding = parseInt(tr.dataset.fi, 10); S.flow = "finding"; render(); });
  }

  function runMenu(i) {
    // rebuild the opts to get the act fn
    const map = {
      provider: screenProviderActs, scope: screenScopeActs,
      approval: () => approvalActs(false), approvalHigh: () => approvalActs(true),
    }[S.flow];
    if (!map) return;
    const acts = map();
    if (acts[i]) acts[i]();
  }
  function screenProviderActs() { return D.providers.map(p => () => setProvider(p)); }
  function screenScopeActs() { return [approveScope, () => toast("Edit manifest — not shown in this demo"), () => { S = fresh(); render(); }]; }
  function approvalActs(high) {
    return [
      () => toast("Details: scope limits, exact request and audit trail"),
      () => high ? confirmHigh() : afterGate(false),
      () => { toast("Assessment stopped at the gate"); S = fresh(); render(); },
      () => toast("Edit params — policy re-checks the new value"),
    ];
  }

  function submit(v) {
    if (!v) return;
    if (v.startsWith("/")) return command(v);
    startAssessment(v);
  }
  function command(v) {
    const c = v.split(/\s+/)[0];
    if (c === "/provider" || c === "/providers" || c === "/model" || c === "/models") { S.flow = "provider"; render(); }
    else if (c === "/template" || c === "/templates" || c === "/new" || c === "/start") { startAssessment(D.TARGET); }
    else if (c === "/plan") { S.flow = "plan"; render(); }
    else if (c === "/findings") { S.flow = "findings"; render(); }
    else if (c === "/report") { S.flow = "report"; render(); }
    else if (c === "/web" || c === "/dashboard") { window.App.show("dashboard"); }
    else toast(`${c} — try /provider, /template, /findings, /report, /web`);
  }

  function act(a) {
    switch (a) {
      case "runplan": runPlan(); break;
      case "editsteps": toast("Edit steps — change where a risky action runs"); break;
      case "login-submit": toast("Signed in · one login covers the scope's tools"); S.flow = "approval"; render(); break;
      case "login-cancel": S.flow = "plan"; render(); break;
      case "tofindings": S.flow = "findings"; render(); break;
      case "toreport": S.flow = "report"; render(); break;
      case "prevf": S.finding = (S.finding - 1 + D.findings.length) % D.findings.length; render(); break;
      case "nextf": S.finding = (S.finding + 1) % D.findings.length; render(); break;
      case "exp-json": downloadJSON(); break;
      case "exp-pdf": toast("📄 Exported PDF report to ./reports/ (demo)"); break;
      case "exp-docx": toast("📄 Exported DOCX report to ./reports/ (demo)"); break;
      case "web": window.App.show("dashboard"); break;
    }
  }

  function downloadJSON() {
    const data = { schema: "reconix.assessment/v1", target: D.TARGET, template: "Web URL",
      methodology: D.methodology, findings: D.findings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "reconix-report.json"; a.click(); URL.revokeObjectURL(a.href);
    toast("⬇ Exported JSON report");
  }

  function toast(msg) { window.App && window.App.toast(msg); }

  // ---------- tour hooks ----------
  function goto(state) {
    clearTimeout(S._t);
    switch (state) {
      case "start": S = fresh(); render(); break;
      case "provider": if (!S.target) { S.flow = "provider"; } else S.flow = "provider"; render(); break;
      case "input": S = fresh(); render(); demoType(); break;
      case "scope": S.target = D.TARGET; S.llm = S.llm || { label: "Reconix (default)", model: "reconix-sec-1" };
        S.convo = [{ who: "you", text: D.TARGET }, { who: "reconix", text: "Recommending the Web template and drafting a scope manifest." }];
        S.flow = "scope"; render(); break;
      case "execution": prepRun(); S.execLines = D.execLog.slice(0, 7); S.execPhase = "scanning"; S.execMsg = "Nuclei + OWASP ZAP on the permitted surface"; S.flow = "execution"; render(); break;
      case "finding": prepRun(); S.execPhase = "done"; S.finding = 0; S.flow = "finding"; render(); break;
      case "findings": prepRun(); S.execPhase = "done"; S.flow = "findings"; render(); break;
      case "report": prepRun(); S.execPhase = "done"; S.flow = "report"; render(); break;
    }
  }
  function prepRun() {
    S.llm = S.llm || { label: "Reconix (default)", model: "reconix-sec-1" };
    S.target = D.TARGET; S.scopeApproved = true; S.planRun = true; S.execDone = true;
    S.convo = [{ who: "you", text: D.TARGET }];
  }
  function demoType() {
    const input = body.querySelector("#prompt"); if (!input) return;
    const txt = "test my website https://shop.example.com for security issues";
    let i = 0; input.value = "";
    (function type() { if (i <= txt.length) { input.value = txt.slice(0, i++); input.scrollLeft = input.scrollWidth; S._tt = setTimeout(type, 32); } })();
  }

  function mount(el) { root = el; S = fresh(); render(); }
  return { mount, goto, get state() { return S; } };
})();
