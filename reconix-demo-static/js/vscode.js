/* VS Code surface — chrome + the Reconix Code Scanner webview panel + a faked scan. */
window.VSCode = (function () {
  const D = window.RECONIX.vscode;
  let root, S, timer;

  const SEVVAR = { critical: "var(--sev-critical)", high: "var(--sev-high)", medium: "var(--sev-medium)", low: "var(--sev-low)", info: "var(--info)" };
  const ACT = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H4V4h8l2 2h6v14z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 3-4 2.5-6 4"/></svg>',
    debug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M5 7l2 2M19 7l-2 2M4 13h3M17 13h3M12 22a6 6 0 0 0 6-6v-3a6 6 0 0 0-12 0v3a6 6 0 0 0 6 6z"/></svg>',
  };
  const CARDS = [
    ["folder", "Scan this project", "Scan the current workspace for vulnerabilities", "scan"],
    ["file", "Scan the current file", "Focus on the active file", "msg"],
    ["github", "Scan a GitHub repo", "Scan from a GitHub URL", "msg"],
    ["alert", "Most serious problems", "Show the top critical issues", "findings"],
    ["list", "Summarize all findings", "Get a clear summary", "summary"],
    ["wrench", "Fix all high findings", "Suggest and apply fixes", "fixall"],
    ["refresh", "Scan again from scratch", "Run a full rescan", "scan"],
    ["gear", "Custom scan", "Tell me what to scan and how", "msg"],
  ];
  const SM = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h6l2 2h10v10H3z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6v18h12V8z"/><path d="M14 3v5h5"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.9 2.8 5.9 3.1 5.9 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.5 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.8 2.8-2.3-2.3 2.1-3.5z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.4 2h-4l-.4 2.4a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/></svg>',
  };

  function esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  function highlight(src) {
    return esc(src)
      .replace(/(\/\/.*)$/g, '<span class="tok-com">$1</span>')
      .replace(/(&quot;|&#39;|").*?(\1)/g, m => `<span class="tok-str">${m}</span>`)
      .replace(/\b(const|let|var|require|module|exports|function|return|new)\b/g, '<span class="tok-kw">$1</span>');
  }
  function editor() {
    const sevByLine = {};
    D.findings.forEach(f => sevByLine[f.line] = f.severity);
    const lines = D.code.map((c, i) => {
      const ln = i + 1, sev = sevByLine[ln];
      const dot = sev ? `<span class="gutter-dot" style="background:${SEVVAR[sev]}"></span>` : "";
      const cls = sev ? `squig ${sev === "critical" || sev === "high" ? "error" : "warn"}` : "";
      const src = S.scanned && sev ? `<span class="${cls}">${c.replace(/^(\s*)/, "")}</span>` : highlight(c);
      const indent = (c.match(/^(\s*)/) || [""])[0];
      return `<div class="code-line"><span class="ln">${dot}${ln}</span><span class="src">${indent}${S.scanned && sev ? src : highlight(c)}</span></div>`;
    }).join("");
    return `<div class="vsc-editor">
      <div class="vsc-tabs"><div class="vsc-tab active">${S.scanned ? '<span class="dot"></span>' : ""} orders.js</div></div>
      <div class="vsc-breadcrumb">${esc(D.repo)} › app › routes › orders.js</div>
      <div class="vsc-code">${lines}</div></div>`;
  }

  function panelWelcome() {
    const cards = CARDS.map(([ico, t, d, act]) => `<div class="ai-prompt" data-card="${act}">
      <div class="ico">${SM[ico] || SM.gear}</div><div class="pt">${esc(t)}</div><div class="pd">${esc(d)}</div></div>`).join("");
    return `<div class="ai-welcome">
      <h2>How can I help with your code?</h2>
      <p>I can scan your workspace, a folder or a GitHub repo, explain the findings and fix them. You review every change before it is applied.</p>
      <div class="ai-cards">${cards}</div></div>`;
  }

  function summaryCard() {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    D.findings.forEach(f => c[f.severity]++);
    const total = D.findings.length;
    const seg = ["critical", "high", "medium", "low"].map(k => c[k] ? `<span style="background:${SEVVAR[k]};width:${(c[k] / total) * 100}%"></span>` : "").join("");
    const legend = ["critical", "high", "medium", "low"].filter(k => c[k]).map(k => `<span class="lg"><span class="d" style="background:${SEVVAR[k]}"></span>${c[k]} ${k}</span>`).join("");
    const fix = D.summary.fixFirst.map((f, i) => `<div class="sc-fix" data-fix="${f.id}"><span>${i + 1}. ${esc(f.text)}</span><span class="fbtn">Fix</span></div>`).join("");
    const aff = D.summary.affected.map(a => `<div style="font-size:12px;color:var(--muted-foreground)">${esc(a[0])} · ${a[1]}</div>`).join("");
    return `<div class="sc-card">
      <div class="sc-head"><span class="t">${esc(D.summary.title)}</span><span class="s">${esc(D.summary.subtitle)}</span><span class="n">${D.summary.total}</span></div>
      <div class="sc-bar">${seg}</div><div class="sc-legend">${legend}</div>
      <div class="sc-sec"><h5>Overall</h5><p style="font-size:12.5px;margin:0">${esc(D.summary.overall)}</p></div>
      <div class="sc-sec"><h5>Fix first</h5>${fix}</div>
      <div class="sc-sec"><h5>Most affected</h5>${aff}</div>
      <div class="sc-actions"><button class="primary" data-card="fixall">Fix all</button><button data-gotab="findings">View findings</button></div>
    </div>`;
  }

  function panelChat() {
    const msgs = S.messages.map(m => {
      if (m.type === "summary") return `<div class="ai-row assistant"><div class="orb"></div><div class="ai-prose">${summaryCard()}</div></div>`;
      if (m.who === "user") return `<div class="ai-row user"><div class="ai-bubble">${esc(m.text)}</div></div>`;
      return `<div class="ai-row assistant"><div class="orb"></div><div class="ai-prose">${esc(m.text)}</div></div>`;
    }).join("");
    return S.messages.length ? `<div>${msgs}</div>` : panelWelcome();
  }

  function panelFindings() {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    D.findings.forEach(f => c[f.severity]++);
    const chips = ["critical", "high", "medium", "low"].map(k =>
      `<span class="ai-fchip"><span class="d" style="background:${SEVVAR[k]}"></span>${k[0].toUpperCase() + k.slice(1)} ${c[k]}</span>`).join("");
    const items = D.findings.map(f => {
      const patch = f.patch.map(l => {
        const cls = l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "";
        return `<span class="${cls}">${esc(l)}</span>`;
      }).join("\n");
      const verdict = f.verdict === "likely_real" ? '<span class="f-verdict real">Likely real</span>'
        : f.verdict === "unsure" ? '<span class="f-verdict unsure">Unsure</span>' : '<span class="f-verdict reviewing">Reviewing…</span>';
      return `<div class="finding sev-${f.severity} ${S.open === f.id ? "open" : ""}" data-open="${f.id}">
        <div class="f-top"><span class="f-badge">${f.badge}</span><span class="f-title">${esc(f.title)}</span></div>
        <div class="f-meta"><span>${esc(f.file)}:${f.line}</span>${verdict}<span>${f.tools.join(" + ")}</span><span class="f-new">NEW</span></div>
        <div class="f-detail">
          <h6>What's wrong</h6><p>${esc(f.whatsWrong)}</p>
          <h6>How to fix</h6><p>${esc(f.howToFix)}</p>
          <h6>Suggested patch</h6><div class="patch">${patch}</div>
          <div class="f-actions"><button data-act="open">Open</button><button class="primary" data-fix="${f.id}">Fix</button><button data-act="copy">Copy patch</button><button data-act="ask">Ask in chat</button></div>
          <div class="f-facts">${esc(f.file)} · Lines ${f.lines} · ${esc(f.rule_id)} · ${esc(f.cwe)}</div>
        </div></div>`;
    }).join("");
    return `<div class="ai-filter">${chips}</div>${items}`;
  }

  function render() {
    const scanning = S.scanning;
    const pct = S.pct || 0;
    const worst = D.findings.filter(f => f.severity === "critical").length + " critical · " + D.findings.filter(f => f.severity === "high").length + " high";
    const statusText = scanning ? `$(sync) Reconix ${pct}%` : S.scanned ? "⛉ " + worst : "⛉ Reconix";
    const progress = scanning ? `<div class="ai-progress"><div class="track"><span style="width:${pct}%"></span></div>
      <div class="prow"><span>${pct}% · ${esc(S.msg || "")}</span><span class="stop" data-act="stop">Stop</span></div></div>` : "";
    const rescanCls = S.scanned ? "ai-rescan" : "ai-rescan";
    const body = S.tab === "findings" ? panelFindings() : panelChat();
    root.innerHTML = `<div class="vsc">
      <div class="vsc-titlebar"><span class="lights"><i class="r"></i><i class="y"></i><i class="g"></i></span>
        <span class="tt">storefront — orders.js — Visual Studio Code</span></div>
      <div class="vsc-main">
        <div class="vsc-activitybar">
          <div class="vsc-act">${ACT.files}</div><div class="vsc-act">${ACT.search}</div>
          <div class="vsc-act">${ACT.git}</div><div class="vsc-act">${ACT.debug}</div>
          <div class="vsc-act shield active">${ACT.shield}</div>
        </div>
        ${editor()}
        <div class="vsc-panel">
          <div class="ai-header">
            <div class="row1"><span class="orb"></span><span class="title">Reconix Code Scanner</span>
              <span class="hbtns"><span>⟳ History</span><span>＋</span></span></div>
            <div class="ai-tabs">
              <div class="ai-pill"><button class="${S.tab !== "findings" ? "on" : ""}" data-gotab="chat">Chat</button>
                <button class="${S.tab === "findings" ? "on" : ""}" data-gotab="findings">Findings ${S.scanned ? `<span class="cnt">${D.findings.length}</span>` : ""}</button></div>
              <button class="ai-rescan ${S.scanned ? "attention" : ""}" data-card="scan">⟳ ${S.scanned ? "Rescan · 4" : "Rescan"}</button>
            </div></div>
          ${progress}
          <div class="ai-scroll">${body}</div>
          <div class="ai-composer"><div class="box">
            <textarea rows="1" placeholder="Ask anything, or tell me what to scan…"></textarea>
            <div class="crow"><span class="model-chip" style="font-family:var(--font-mono);font-size:11px;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;padding:4px 9px;color:var(--muted-foreground)"><span style="width:7px;height:7px;border-radius:50%;background:var(--success)"></span>default-model</span>
              <button class="send">↑</button></div>
            <div class="foot">Scans run on your harness. Fixes are shown as a diff before anything changes.</div>
          </div></div>
        </div>
      </div>
      <div class="vsc-statusbar ${S.scanned ? "hasfindings" : ""}">
        <span>⛉ ${statusText.replace("$(sync) ", "")}</span>
        <span class="sright"><span>UTF-8</span><span>JavaScript</span><span>Ln ${D.findings[0] ? D.findings[0].line : 1}, Col 1</span></span>
      </div></div>`;
    wire();
  }

  function wire() {
    root.querySelectorAll("[data-gotab]").forEach(b => b.onclick = () => { S.tab = b.dataset.gotab; render(); });
    root.querySelectorAll("[data-card]").forEach(b => b.onclick = () => card(b.dataset.card));
    root.querySelectorAll("[data-open]").forEach(el => el.onclick = e => {
      if (e.target.closest(".f-actions") || e.target.closest("[data-fix]")) return;
      S.open = S.open === el.dataset.open ? null : el.dataset.open; render();
    });
    root.querySelectorAll("[data-fix]").forEach(b => b.onclick = e => { e.stopPropagation(); doFix(b.dataset.fix); });
    root.querySelectorAll("[data-act='stop']").forEach(b => b.onclick = () => { clearInterval(timer); S.scanning = false; render(); });
    const send = root.querySelector(".send"); if (send) send.onclick = () => {
      const ta = root.querySelector(".ai-composer textarea"); const v = (ta.value || "").trim(); if (!v) return;
      S.messages.push({ who: "user", text: v }); S.tab = "chat"; render();
      if (/scan/i.test(v)) setTimeout(() => startScan(), 300);
      else { S.messages.push({ who: "assistant", text: "I can scan your workspace, explain any finding, or fix it. Try “scan this project”." }); render(); }
    };
  }

  function card(act) {
    if (act === "scan") return startScan();
    if (act === "findings") { S.tab = "findings"; render(); }
    else if (act === "summary") { if (!S.scanned) return startScan(); S.tab = "chat"; if (!S.messages.some(m => m.type === "summary")) S.messages.push({ type: "summary" }); render(); }
    else if (act === "fixall") { S.messages.push({ who: "user", text: "fix all high findings" }); doFixAll(); }
    else window.App.toast("Demo: pick “Scan this project”");
  }

  function startScan() {
    clearInterval(timer);
    S.messages.push({ who: "user", text: "scan this project" });
    S.scanning = true; S.scanned = false; S.tab = "chat"; S.pct = 0; S.msg = "Preparing the scan";
    render();
    let i = 0;
    timer = setInterval(() => {
      if (i >= D.stages.length) {
        clearInterval(timer); S.scanning = false; S.scanned = true; S.tab = "findings";
        S.messages.push({ type: "summary" });
        render(); window.App.toast("Scan complete · 4 findings");
        return;
      }
      S.pct = D.stages[i].pct; S.msg = D.stages[i].msg; i++; render();
    }, 520);
  }

  function doFix(id) {
    const f = D.findings.find(x => x.id === id);
    window.App.toast(`✓ Applied fix · ${f.title} (diff reviewed)`);
  }
  function doFixAll() {
    S.tab = "chat";
    S.messages.push({ who: "assistant", text: "Fixed 3 findings across app/routes/orders.js. The scanners no longer report them. Review the diffs, then Apply all." });
    render(); window.App.toast("Fix agent finished · 3 files, diffs ready");
  }

  function mount(el) { root = el; S = { tab: "chat", scanning: false, scanned: false, pct: 0, messages: [], open: null }; render(); }
  function goto(state) {
    if (state === "scan") { if (!S.scanned && !S.scanning) startScan(); }
    else render();
  }
  return { mount, goto };
})();
