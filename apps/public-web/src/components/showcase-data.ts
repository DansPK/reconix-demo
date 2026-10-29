export type ShowcaseItem = {
  eyebrow: string;
  word: string; // short word drawn as the ASCII banner
  title: string;
  tagline: string;
  points: string[];
  focus: string; // hub id in the node graph
};

export const SHOWCASE: ShowcaseItem[] = [
  {
    eyebrow: "Assessment Scope",
    word: "Scope",
    title: "Scope first. Always.",
    tagline: "Define authorized targets, permitted actions, exclusions and assessment limits before testing begins.",
    points: [
      "A Scope Manifest is drafted from your request and a predefined assessment template",
      "Review and edit targets, exclusions and assessment limits before execution",
      "Selecting a template does not authorize testing; explicit approval is required",
    ],
    focus: "terminal",
  },
  {
    eyebrow: "Security Guardrails",
    word: "Policy",
    title: "Guardrails on every action.",
    tagline: "Enforce scope, command, risk and execution-limit checks before every security tool call.",
    points: [
      "Out-of-scope targets and prohibited actions are blocked",
      "Security testing begins only after the required authorization is granted",
      "Requests, policy decisions and approval records are kept in the audit log",
    ],
    focus: "backend",
  },
  {
    eyebrow: "Security Tool Integration",
    word: "Tools",
    title: "Approved tools. Controlled execution.",
    tagline: "Run supported tools, including Nmap, Nuclei, OWASP ZAP, Semgrep, Gitleaks and Trivy, with validated inputs inside the authorized scope.",
    points: [
      "Commands are built from approved templates, not arbitrary free-form input",
      "Every tool runs only against targets inside the authorized scope",
      "Destructive actions require explicit approval before execution",
      "Only enabled and approved tool integrations are available",
    ],
    focus: "tools",
  },
  {
    eyebrow: "AI-Powered Analysis",
    word: "Analysis",
    title: "Findings, not raw output.",
    tagline: "Turn scanner output into structured findings by classifying, correlating, prioritizing and attaching evidence.",
    points: [
      "Low-confidence findings are flagged NEEDS_REVIEW for human validation",
      "Severity is derived from scanner data, CVSS or defined policy rules",
      "Related results from multiple tools are correlated into one finding",
      "AI explains findings without changing the underlying evidence",
    ],
    focus: "ai",
  },
  {
    eyebrow: "Security Knowledge",
    word: "Knowledge",
    title: "Grounded in trusted sources.",
    tagline: "Combine trusted security standards, vulnerability intelligence and internal guidance to support every finding.",
    points: [
      "Retrieves relevant references from OWASP, CWE, CVE/NVD, advisories and internal knowledge",
      "Internal guidance is prioritized",
      "Relevant sources are attached so findings can be verified",
      "External vulnerability data can be refreshed when current information is required",
    ],
    focus: "knowledge",
  },
  {
    eyebrow: "Assessment & Reporting",
    word: "Reports",
    title: "Review it. Report it.",
    tagline: "Inspect every assessment in one read-only view, then generate a handoff-ready security report.",
    points: [
      "Filter findings by severity, target, category, status and source tool",
      "Review masked evidence, validation status, remediation and audit history",
      "See which findings are confirmed, rejected or still need review",
      "Export reports with scope, methodology, findings, evidence and remediation",
      "Keep assessment data available locally for review without rerunning tools",
    ],
    focus: "viewer",
  },
];
