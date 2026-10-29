/**
 * Sample data for the "See Reconix in action" previews (sections/product-preview.tsx).
 * One fictional Web URL assessment threads through every screen, so the counts in
 * the dashboard, findings list and report agree. Rules:
 * - hosts use the reserved `.example` TLD and RFC 5737 addresses only;
 * - tools are only the ones the product copy claims (integrations-data.ts);
 * - behaviour (scope approval, risk gates, NEEDS_REVIEW below 0.80, UNKNOWN severity,
 *   masking) must match docs/architecture and showcase-data.ts.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type LogKind = "scope" | "policy" | "tool" | "finding" | "mask" | "gate" | "info";

export const ASSESSMENT = {
  id: "ASM-0142",
  name: "Acme Web Security Assessment",
  target: "app.acme.example",
  template: "Web URL",
  type: "Web application",
  status: "Running",
  progress: 68,
  started: "10:42",
  date: "14 Oct 2026",
  duration: "18m 27s",
  approvedBy: "j.lee",
};

export const SEVERITY: { level: Severity; count: number }[] = [
  { level: "CRITICAL", count: 1 },
  { level: "HIGH", count: 3 },
  { level: "MEDIUM", count: 7 },
  { level: "LOW", count: 4 },
];
export const FINDING_TOTAL = SEVERITY.reduce((n, s) => n + s.count, 0);

export const SCOPE = {
  target: "app.acme.example",
  include: ["app.acme.example", "api.acme.example", "*.acme.example", "203.0.113.24"],
  exclude: ["admin.acme.example", "/billing/*"],
  actions: [
    { name: "Service discovery", tool: "Nmap", risk: "LOW" as Risk },
    { name: "Template checks", tool: "Nuclei", risk: "LOW" as Risk },
    { name: "Passive web scan", tool: "OWASP ZAP", risk: "LOW" as Risk },
    { name: "Active web scan", tool: "OWASP ZAP", risk: "MEDIUM" as Risk },
  ],
  limits: [
    { label: "Rate", value: "5 req/s" },
    { label: "Tool calls", value: "40" },
    { label: "Window", value: "2 h" },
  ],
};

export type LogLine = { t: string; kind: LogKind; text: string };

export const LOG: LogLine[] = [
  { t: "10:42:01", kind: "info", text: "Assessment ASM-0142 started" },
  { t: "10:42:04", kind: "scope", text: "Target scope validated against Scope Manifest v1" },
  { t: "10:42:08", kind: "policy", text: "nmap -sV app.acme.example · risk LOW · auto-run" },
  { t: "10:42:15", kind: "tool", text: "Discovered 4 hosts, 9 open services" },
  { t: "10:42:17", kind: "policy", text: "admin.acme.example blocked · excluded target" },
  { t: "10:42:21", kind: "tool", text: "Starting HTTP analysis · OWASP ZAP passive scan" },
  { t: "10:42:29", kind: "tool", text: "Running vulnerability checks · Nuclei templates" },
  { t: "10:42:31", kind: "mask", text: "1 session token masked in tool output" },
  { t: "10:42:35", kind: "finding", text: "Finding detected: Missing security headers" },
  { t: "10:42:38", kind: "finding", text: "Finding detected: SQL injection on /search" },
  { t: "10:42:41", kind: "gate", text: "Active web scan · risk MEDIUM · awaiting approval" },
];

/** Shorter feed for the dashboard's "Recent activity" card. */
export const RECENT = [LOG[10], LOG[9], LOG[8], LOG[4]];

export type Finding = {
  id: string;
  title: string;
  severity: Severity;
  target: string;
  tool: string;
  cwe: string;
  rating: string;
};

export const FINDINGS: Finding[] = [
  { id: "F-001", title: "SQL injection in search parameter", severity: "CRITICAL", target: "app.acme.example/search?q=", tool: "OWASP ZAP", cwe: "CWE-89", rating: "CVSS 9.8" },
  { id: "F-002", title: "Reflected cross-site scripting", severity: "HIGH", target: "app.acme.example/profile?name=", tool: "OWASP ZAP", cwe: "CWE-79", rating: "CVSS 7.4" },
  { id: "F-003", title: "Exposed Redis service", severity: "HIGH", target: "203.0.113.24:6379", tool: "Nmap", cwe: "CWE-284", rating: "CVSS 8.6" },
  { id: "F-004", title: "Weak TLS configuration (TLS 1.0 enabled)", severity: "MEDIUM", target: "api.acme.example:443", tool: "Nuclei", cwe: "CWE-326", rating: "scanner" },
  { id: "F-005", title: "Missing security headers", severity: "LOW", target: "app.acme.example", tool: "Nuclei", cwe: "CWE-693", rating: "scanner" },
];

/** The finding opened in the detail pane and quoted in the report. */
export const FEATURED = {
  ...FINDINGS[0],
  description:
    "The q parameter is concatenated into a SQL query. A crafted value changes the query and returns rows from other tables.",
  impact: "Read access to customer records; possible data modification.",
  evidence: [
    { text: "GET /search?q=shoes'+OR+'1'='1 HTTP/1.1", tone: "request" },
    { text: "HTTP/1.1 200 OK  · 1,284 rows (expected 12)", tone: "response" },
    { text: "Cookie: session=••••••••••••a91f", tone: "masked" },
  ] as const,
  remediation: [
    "Use parameterized queries for every database call",
    "Validate q against an allow-list of characters",
    "Run the database user with read-only rights",
  ],
  references: ["CWE-89", "OWASP A03:2021"],
  confidence: 0.96,
};
