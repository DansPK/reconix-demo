/**
 * Data for the "See Reconix in action" previews (sections/product-preview.tsx): the www.lumina.com
 * Web URL run, as scripted in apps/terminal (store/templates/web_url.py). Keep findings, evidence,
 * log lines and counts equal to that run. Evidence stays masked here.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type LogTone = "default" | "ok" | "warn" | "block";

export const ASSESSMENT = {
  id: "RCX-001",
  name: "Lumina web application",
  target: "www.lumina.com",
  template: "Web URL",
  status: "Completed",
  date: "6 Oct 2026",
  duration: "3m 55s",
  requests: "1,202",
  approvedBy: "analyst",
};

/** The run's plan, with the tools each step used. */
export const PLAN = [
  { step: "Map the site", tools: "whatweb, Katana, ffuf" },
  { step: "Scan for weaknesses", tools: "Nuclei, testssl.sh, nikto" },
  { step: "Validate findings", tools: "Nuclei, dalfox, testssl.sh, httpx" },
  { step: "Correlate & dedupe findings", tools: "" },
  { step: "Generate report", tools: "" },
];

export const SCOPE = {
  permitted: [
    "Discover pages and endpoints",
    "Scan for known vulnerabilities",
    "Carefully confirm what it finds",
    "Send only GET and POST requests",
  ],
  excluded: ["/admin"],
  tools: "whatweb, httpx, Katana, Nuclei, testssl.sh, ffuf, nikto, dalfox",
};

export type LogLine = { t: string; who: "reconix" | "you" | "policy" | "tool"; text: string; tone?: LogTone };

export const LOG: LogLine[] = [
  { t: "09:01:32", who: "you", text: "Scope approved", tone: "ok" },
  { t: "09:01:58", who: "you", text: "Plan approved · testing starts", tone: "ok" },
  { t: "09:02:13", who: "policy", text: "Scope check: passed", tone: "ok" },
  { t: "09:02:19", who: "tool", text: "Executing permitted scan · Katana" },
  { t: "09:02:29", who: "tool", text: "Crawled 24 pages · 6 API endpoints mapped" },
  { t: "09:02:31", who: "tool", text: "Technology fingerprint: nginx · MySQL · lodash" },
  { t: "09:02:42", who: "tool", text: "Nuclei: checks on the permitted surface" },
  { t: "09:02:45", who: "reconix", text: "Proposed request: GET /admin", tone: "warn" },
  { t: "09:03:05", who: "policy", text: "Blocked: GET /admin · Path outside approved scope. Not executed.", tone: "block" },
  { t: "09:03:08", who: "tool", text: "Continuing on permitted targets" },
  { t: "09:03:21", who: "reconix", text: "Candidate F-004 · SQL injection", tone: "warn" },
  { t: "09:03:27", who: "policy", text: "Risk: MEDIUM · approval required", tone: "warn" },
];

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  path: string;
  cvss: string;
  state: "Confirmed" | "Needs review";
};

export const FINDINGS: Finding[] = [
  { id: "F-004", title: "SQL injection in catalog search", severity: "CRITICAL", path: "/api/v1/products", cvss: "9.8", state: "Confirmed" },
  { id: "F-005", title: "Outdated JavaScript dependency with a known CVE", severity: "HIGH", path: "/assets/js/vendor.min.js", cvss: "8.1", state: "Needs review" },
  { id: "F-001", title: "Unauthenticated access to order records", severity: "HIGH", path: "/api/orders/{id}", cvss: "7.5", state: "Confirmed" },
  { id: "F-002", title: "Reflected input in search page", severity: "MEDIUM", path: "/search", cvss: "6.1", state: "Needs review" },
  { id: "F-003", title: "Session cookie missing SameSite", severity: "LOW", path: "/login", cvss: "3.1", state: "Needs review" },
];

export const FINDING_TOTAL = FINDINGS.length;
export const CONFIRMED = FINDINGS.filter((f) => f.state === "Confirmed").length;
export const SEVERITY = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => ({
  level,
  count: FINDINGS.filter((f) => f.severity === level).length,
}));

/** The finding opened in the detail pane and quoted in the report. */
export const FEATURED = {
  ...FINDINGS[0],
  target: "https://www.lumina.com/api/v1/products?q=",
  tool: "Nuclei",
  cwe: "CWE-89",
  description:
    "The catalog search needs no sign-in, and the q parameter is concatenated straight into a SQL query. A single always-true payload returned every row.",
  impact:
    "An unauthenticated attacker can read the entire customer database: names, emails, phone numbers, saved cards and password hashes.",
  evidence: [
    "GET /api/v1/products?q=cotton' OR '1'='1-- -",
    "HTTP 200 · all 48,215 rows (no auth)",
    "1 | Sophea Chan | s•••@gmail.com | +855 12 ••• | •••• 5466",
  ],
  remediation: [
    "Use parameterized queries for every database call",
    "Run the app with a least-privilege database account",
    "Store passwords with a slow salted hash",
  ],
  references: ["CWE-89", "OWASP A03:2021"],
};
