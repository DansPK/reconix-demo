/* Seed content for the Reconix static demo.
   Strings are lifted from the real sources:
   - reconix/store/templates/web_url.py  (scope, plan, approvals, findings, exec cards)
   - web/sample-data/*.json              (dashboard run rows + richer finding set)
   - vscode-extension fakes + README     (code-scanner findings/summary)
   Exposed as a single global so the demo also works over file://. */
window.RECONIX = (function () {
  const TARGET = "https://shop.example.com";
  const HOST = "shop.example.com";

  const providers = [
    { id: "reconix", label: "Reconix (default)", kind: "reconix",
      hint: "Reconix model endpoint · built-in", models: ["reconix-sec-1"] },
    { id: "openai", label: "OpenAI", kind: "frontier",
      hint: "API key · gpt-4o, gpt-4o-mini", models: ["gpt-4o", "gpt-4o-mini"] },
    { id: "anthropic", label: "Anthropic", kind: "frontier",
      hint: "API key · claude-sonnet-5-5, claude-opus-5-5",
      models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] },
    { id: "deepseek", label: "DeepSeek", kind: "frontier",
      hint: "API key · deepseek-chat, deepseek-reasoner",
      models: ["deepseek-chat", "deepseek-reasoner"] },
    { id: "ollama", label: "Ollama", kind: "local", hint: "Local · model name", models: [] },
    { id: "openai_compatible", label: "Custom OpenAI-compatible", kind: "local",
      hint: "Local · base URL + model", models: [] },
  ];

  // Catalog display order from reconix/store/templates/__init__.py
  const templates = [
    { id: "network", name: "Network", desc: "Hosts, ports, and exposed services",
      example: "10.0.0.0/24" },
    { id: "api", name: "API", desc: "REST and GraphQL endpoints",
      example: "https://api.example.com/v1" },
    { id: "source", name: "Source Code", desc: "Static review of a repository",
      example: "https://git.example.com/acme/app.git" },
    { id: "web_url", name: "Web URL", desc: "Web application at a URL",
      example: "https://shop.example.com" },
  ];

  const commands = [
    ["/help", "Show shortcuts for this screen"],
    ["/new", "Start a new assessment (optionally on a target)"],
    ["/template", "Pick a template, then type its target"],
    ["/plan", "Review and run the test plan"],
    ["/approval", "Open the approval gate"],
    ["/status", "Live execution (after the plan runs)"],
    ["/findings", "List all findings"],
    ["/finding", "Open one finding"],
    ["/report", "Open the assessment report"],
    ["/export", "Export the report"],
    ["/summary", "Show the assessment summary"],
    ["/assessments", "List and reopen assessments"],
    ["/audit", "Activity log and audit trail"],
    ["/assess", "Run a real assessment with the AI agent (needs a /model)"],
    ["/add-on", "Add reference files for the AI (knowledge add-ons)"],
    ["/provider", "Manage LLM providers (set / test / use a model / unset)"],
    ["/model", "Pick the active LLM model (provider/model)"],
    ["/web", "Open the web dashboard in your browser"],
    ["/quit", "Quit Reconix"],
  ];

  // Scope manifest — reconix/store/templates/web_url.py build_scope()
  const scope = {
    target: TARGET,
    kind: "web application",
    mayDo: [
      "Discover pages and endpoints",
      "Scan for known vulnerabilities",
      "Carefully confirm what it finds",
      "Send only GET and POST requests",
      "Sign in with a test account you give it, then a one-time code (for OWASP ZAP)",
    ],
    neverTouch: ["/admin"],
    tools: ["Nuclei", "OWASP ZAP"],
    timeLimit: 30,
  };

  const plan = [
    { phase: "discovery", label: "Crawl & map endpoints", risk: "LOW", gate: "runs automatically" },
    { phase: "scanning", label: "Scan for vulnerabilities", risk: "LOW", gate: "runs automatically" },
    { phase: "validation", label: "Validate access controls", risk: "HIGH", gate: "needs your approval" },
    { phase: "analysis", label: "Correlate & dedupe findings", risk: "LOW", gate: "runs automatically" },
    { phase: "report", label: "Generate report", risk: "LOW", gate: "runs automatically" },
  ];

  // Live-output lines for the Execution screen (who, text, tone).
  // who: SYS | TOOL | POLICY | AI | USER
  const execLog = [
    { who: "SYS", text: "Scope check: passed", tone: "ok" },
    { who: "TOOL", text: "Executing permitted scan · OWASP ZAP", tone: "tool" },
    { who: "TOOL", text: "OWASP ZAP: crawling the permitted surface", tone: "tool" },
    { who: "AI", text: "Discovery · OWASP ZAP", tone: "card",
      rows: [["Public pages", "18"], ["Forms", "4"], ["API endpoints", "6"]] },
    { who: "POLICY", text: "Blocked: GET /admin · Path excluded from the scope. Not executed.", tone: "block" },
    { who: "TOOL", text: "Executing permitted scan · Nuclei", tone: "tool" },
    { who: "AI", text: "Scan · Nuclei + OWASP ZAP", tone: "card",
      rows: [["Potential issues", "3"], ["Needs login", "/api/orders/*"]] },
    { who: "AI", text: "Candidate F-001 · access control", tone: "ai" },
    { who: "AI", text: "Suspected issue on /api/orders/{id}: possible missing object-level access check. Proposing limited validation.", tone: "ai" },
  ];

  const analysisSteps = [
    "Analyzing results",
    "Retrieving relevant OWASP and CWE guidance",
    "Correlating duplicate findings",
    "Masking sensitive evidence",
  ];

  const approvals = [
    { id: "approval-001", risk: "MEDIUM", action: "Baseline request (read-only)",
      target: "GET /api/orders/10482", param: "Path",
      purpose: "Record the normal response for the test account's own order",
      impact: "Low. One read request, no data changes",
      command: "GET https://shop.example.com/api/orders/10482 as test account A",
      hash: "a1f0c7d9e2b4836150ac9f2" },
    { id: "approval-002", risk: "HIGH", action: "limited_validation",
      target: "GET /api/orders/10483 (test account B)", param: "Path",
      purpose: "Check if account A can read an order owned by account B",
      impact: "May read synthetic test data. 1 request, no changes",
      command: "GET https://shop.example.com/api/orders/10483 as test account A",
      hash: "7c3e9b2a4d5f8016e2c4a90" },
  ];

  // The 3 web findings — reconix/store/templates/web_url.py _findings()
  const findings = [
    { id: "F-001", num: "001", severity: "MEDIUM", title: "Broken object-level authorization",
      path: "/api/orders/{id}", validation: "CONFIRMED", status: "open", tool: "OWASP ZAP",
      affected_url: TARGET + "/api/orders/10483",
      description: "An order record owned by test account B was returned to test account A.",
      impact: "Users could read other customers' order details.",
      remediation: "Enforce server-side ownership checks on every order lookup.",
      references: ["OWASP A01:2021", "OWASP API1:2023", "CWE-639"], category: "Web App",
      cvss_score: 6.5, cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N",
      evidence: ["HTTP 200 · order_id: 10483", "owner: usr_••••42 · email: b•••@example.com",
        "token: •••••••••• (masked)"] },
    { id: "F-002", num: "002", severity: "MEDIUM", title: "Reflected input in search page",
      path: "/search", validation: "UNCONFIRMED", status: "open", tool: "Nuclei",
      affected_url: TARGET + "/search?q=",
      description: "A marker string sent in the q parameter came back unencoded in the page.",
      impact: "May allow cross-site scripting if the reflection is exploitable.",
      remediation: "Apply context-aware output encoding and a strict Content-Security-Policy.",
      references: ["OWASP A03:2021", "CWE-79"], category: "Web App",
      cvss_score: 6.1, cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      evidence: ["GET /search?q=rcx-marker-7 → marker reflected in body (unencoded)"] },
    { id: "F-003", num: "003", severity: "LOW", title: "Session cookie missing SameSite",
      path: "/login", validation: "INCONCLUSIVE", status: "open", tool: "OWASP ZAP",
      affected_url: TARGET + "/login",
      description: "The session cookie set at login has no SameSite attribute.",
      impact: "Weakens protection against cross-site request forgery.",
      remediation: "Set SameSite=Lax (or Strict) on the session cookie.",
      references: ["OWASP A05:2021", "CWE-1275"], category: "Web App",
      cvss_score: 3.1, cvss_vector: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N",
      evidence: ["Set-Cookie: session=••••••••; Secure; HttpOnly"] },
  ];

  const methodology = ["OWASP WSTG", "OWASP Top 10 (2021)"];

  // Assessment history rows for the dashboard (from web/sample-data/*.json).
  const dashRuns = [
    { id: "RCX-DEMO-001", target: "https://shop.example.com", template: "Web URL",
      status: "Completed", progress: 100, findings: 3, when: "just now", current: true },
    { id: "RCX-DEMO-001", target: "https://portal.example.com", template: "Web URL",
      status: "Completed", progress: 100, findings: 8, when: "Oct 5" },
    { id: "RCX-DEMO-002", target: "https://api.example.com/v1", template: "API",
      status: "Completed", progress: 100, findings: 4, when: "Oct 3" },
    { id: "RCX-DEMO-001", target: "git@git.example.com:shop/storefront.git", template: "Source Code",
      status: "Completed", progress: 100, findings: 3, when: "Oct 1" },
    { id: "RCX-DEMO-003", target: "10.0.0.0/24", template: "Network",
      status: "Stopped", progress: 62, findings: 2, when: "Sep 30" },
    { id: "RCX-DEMO-002", target: "https://staging.example.com", template: "Web URL",
      status: "Awaiting input", progress: 40, findings: 1, when: "Sep 28" },
  ];

  // Richer finding set for the dashboard Findings view (portal.example.com run).
  const dashFindings = [
    { id: "IMP-001", severity: "CRITICAL", title: "Admin console reachable without authentication",
      tool: "Nuclei", validation: "UNCONFIRMED", cvss_score: 9.1, path: "/console",
      affected_url: "https://portal.example.com/console", references: ["OWASP A01:2021", "CWE-306"],
      description: "The admin console answered without any credentials.",
      impact: "Full administrative access to anyone who finds the URL.",
      remediation: "Require authentication and restrict the console to an internal network.",
      evidence: ["GET /console → HTTP 200", "title: Admin · build ••••"] },
    { id: "IMP-002", severity: "HIGH", title: "Status page leaks build details",
      tool: "Nuclei", validation: "UNCONFIRMED", cvss_score: 7.5, path: "/status",
      affected_url: "https://portal.example.com/status", references: ["OWASP A05:2021", "CWE-200"],
      description: "An unauthenticated status page exposes build and dependency versions.",
      impact: "Helps an attacker target known-vulnerable components.",
      remediation: "Gate the status page behind authentication; strip version details.",
      evidence: ["build: 2026.09.•• · node 18.••", "commit: ••••a1b"] },
    ...findings.map(f => ({ ...f, affected_url: f.affected_url.replace(HOST, "portal.example.com") })),
    { id: "IMP-005", severity: "MEDIUM", title: "Certificate expires within 30 days",
      tool: "Nuclei", validation: "UNCONFIRMED", cvss_score: 4.0, path: "/",
      affected_url: "https://portal.example.com", references: ["CWE-298"],
      description: "The TLS certificate expires in under 30 days.",
      impact: "An expired certificate breaks clients and erodes trust.",
      remediation: "Renew the certificate and enable automated renewal.",
      evidence: ["notAfter: 2026-10-•• (28 days)"] },
    { id: "IMP-003", severity: "LOW", title: "Web server banner names nginx",
      tool: "Nuclei", validation: "UNCONFIRMED", cvss_score: 2.0, path: "/",
      affected_url: "https://portal.example.com", references: ["CWE-200"],
      description: "The Server header advertises the web server and version.",
      impact: "Minor information disclosure.",
      remediation: "Suppress the Server header version.",
      evidence: ["Server: nginx/1.2•.•"] },
    { id: "IMP-004", severity: "LOW", title: "robots.txt lists internal paths",
      tool: "Nuclei", validation: "UNCONFIRMED", cvss_score: 2.0, path: "/robots.txt",
      affected_url: "https://portal.example.com/robots.txt", references: ["CWE-200"],
      description: "robots.txt discloses internal-only paths.",
      impact: "Points an attacker at non-public areas.",
      remediation: "Remove sensitive paths from robots.txt; protect them properly.",
      evidence: ["Disallow: /internal/••••"] },
  ];

  // VS Code code-scanner findings (source-code class: Semgrep / Gitleaks / SonarQube).
  const vscode = {
    repo: "storefront",
    activeFile: "app/routes/orders.js",
    code: [
      "const express = require('express');",
      "const router = express.Router();",
      "const db = require('../db');",
      "",
      "const DB_PASSWORD = \"s3cr3t-prod-pw\";   // committed credential",
      "",
      "router.get('/orders/:id', (req, res) => {",
      "  const id = req.params.id;",
      "  const q = `SELECT * FROM orders WHERE id = ${id}`;",
      "  db.query(q, (err, rows) => res.json(rows));",
      "});",
      "",
      "router.get('/search', (req, res) => {",
      "  res.send('<h1>Results for ' + req.query.q + '</h1>');",
      "});",
      "",
      "module.exports = router;",
    ],
    findings: [
      { id: "vf1", severity: "critical", badge: "CRIT", title: "SQL injection",
        file: "app/routes/orders.js", line: 9, lines: "9", rule_id: "js.sqli.string-concat",
        cwe: "CWE-89", tools: ["semgrep", "sonarqube"], verdict: "likely_real", status: "new",
        whatsWrong: "The order id from the URL is concatenated straight into a SQL query, so an attacker can inject SQL through the `id` path parameter.",
        howToFix: "Use a parameterised query and bind the id: `db.query('SELECT * FROM orders WHERE id = ?', [id])`.",
        patch: ["- const q = `SELECT * FROM orders WHERE id = ${id}`;",
                "- db.query(q, (err, rows) => res.json(rows));",
                "+ db.query('SELECT * FROM orders WHERE id = ?', [id],",
                "+   (err, rows) => res.json(rows));"] },
      { id: "vf2", severity: "high", badge: "HIGH", title: "Hardcoded database password",
        file: "app/routes/orders.js", line: 5, lines: "5", rule_id: "generic.secret.db-password",
        cwe: "CWE-798", tools: ["gitleaks"], verdict: "likely_real", status: "new",
        whatsWrong: "A database password is written in plaintext in the source and committed to the repository.",
        howToFix: "Load the secret from the environment or a secret manager, and rotate the exposed credential.",
        patch: ["- const DB_PASSWORD = \"****\";",
                "+ const DB_PASSWORD = process.env.DB_PASSWORD;"] },
      { id: "vf3", severity: "medium", badge: "MED", title: "Reflected cross-site scripting",
        file: "app/routes/orders.js", line: 14, lines: "14", rule_id: "js.xss.reflected",
        cwe: "CWE-79", tools: ["semgrep"], verdict: "likely_real", status: "new",
        whatsWrong: "The `q` query parameter is written into the HTML response without encoding, allowing script injection.",
        howToFix: "HTML-encode user input before inserting it, or render through a templating engine that auto-escapes.",
        patch: ["- res.send('<h1>Results for ' + req.query.q + '</h1>');",
                "+ res.send('<h1>Results for ' + escapeHtml(req.query.q) + '</h1>');"] },
      { id: "vf4", severity: "low", badge: "LOW", title: "Weak pseudo-random generator",
        file: "app/util/token.js", line: 3, lines: "3", rule_id: "js.crypto.weak-random",
        cwe: "CWE-338", tools: ["semgrep"], verdict: "unsure", status: "new",
        whatsWrong: "`Math.random()` is used to build a token; it is not cryptographically secure.",
        howToFix: "Use `crypto.randomBytes()` for anything security-sensitive.",
        patch: ["- const token = Math.random().toString(36);",
                "+ const token = crypto.randomBytes(16).toString('hex');"] },
    ],
    stages: [
      { pct: 2, msg: "Preparing the scan" },
      { pct: 5, msg: "Scanning 128 files" },
      { pct: 22, msg: "Semgrep · 1171 rules" },
      { pct: 40, msg: "Gitleaks · secrets" },
      { pct: 55, msg: "SonarQube · bugs & hotspots" },
      { pct: 60, msg: "Merging results" },
      { pct: 80, msg: "Reviewing 4 findings" },
      { pct: 100, msg: "Scan complete" },
    ],
    summary: {
      title: "Scan complete", subtitle: "4 likely real · 0 false alarms", total: 4,
      overall: "Fix the SQL injection first — it is the most serious and the easiest to exploit.",
      fixFirst: [
        { id: "vf1", text: "Parameterise the order query in app/routes/orders.js (SQL injection)" },
        { id: "vf2", text: "Move the database password out of the source (hardcoded secret)" },
        { id: "vf3", text: "Encode the search output in app/routes/orders.js (reflected XSS)" },
      ],
      affected: [["app/routes/orders.js", 3], ["app/util/token.js", 1]],
    },
  };

  // ASCII logo (reconix/screens/start.py LOGO)
  const logo = [
    "██████╗ ███████╗ ██████╗ ██████╗ ███╗   ██╗██╗██╗  ██╗",
    "██╔══██╗██╔════╝██╔════╝██╔═══██╗████╗  ██║██║╚██╗██╔╝",
    "██████╔╝█████╗  ██║     ██║   ██║██╔██╗ ██║██║ ╚███╔╝ ",
    "██╔══██╗██╔══╝  ██║     ██║   ██║██║╚██╗██║██║ ██╔██╗ ",
    "██║  ██║███████╗╚██████╗╚██████╔╝██║ ╚████║██║██╔╝ ██╗",
    "╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝",
  ];

  // Guided-tour beats, mapped to demo-script.md line ranges.
  const tour = [
    { n: 1, surface: "terminal", state: "start", title: "Welcome to Reconix",
      lines: "1–8",
      say: "Reconix is an open-source, AI-powered security-testing assistant. Clone it, run it locally, and start an assessment right from the terminal." },
    { n: 2, surface: "terminal", state: "provider", title: "Select a model provider",
      lines: "9–14",
      say: "First, choose an AI model provider. Reconix supports OpenAI, Anthropic, local models, and its own endpoint. For this demo we'll use the Reconix model endpoint." },
    { n: 3, surface: "terminal", state: "input", title: "The unified input box",
      lines: "15–21",
      say: "One input box takes both plain-language requests and / commands, so beginners and experts use the same interface." },
    { n: 4, surface: "terminal", state: "scope", title: "Template & scope",
      lines: "22–34",
      say: "Reconix recommends the Web template for a URL and drafts a scope manifest you approve. A policy engine then checks every action — low-risk runs automatically, high-risk needs human approval." },
    { n: 5, surface: "terminal", state: "execution", title: "Tools & execution",
      lines: "35–41",
      say: "With the scope approved, Reconix coordinates its tools — here Nuclei and OWASP ZAP — collecting evidence inside the authorized boundary." },
    { n: 6, surface: "terminal", state: "finding", title: "Analysis: AI + RAG",
      lines: "42–51",
      say: "RAG retrieves OWASP and CWE guidance so the AI can explain each finding — its severity, evidence, and how to fix it — grounded in established knowledge." },
    { n: 7, surface: "dashboard", state: "findings", title: "Dashboard & reporting",
      lines: "52–60",
      say: "The Web Security Assessment Dashboard brings results together — findings, evidence, and history — and exports structured reports as JSON, PDF, or DOCX." },
    { n: 8, surface: "vscode", state: "scan", title: "VS Code integration",
      lines: "61–64",
      say: "Finally, Reconix integrates with VS Code, bringing security testing right into the developer's workflow." },
  ];

  return { TARGET, HOST, providers, templates, commands, scope, plan, execLog,
    analysisSteps, approvals, findings, methodology, dashRuns, dashFindings, vscode, logo, tour };
})();
