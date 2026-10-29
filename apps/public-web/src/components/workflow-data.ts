import {
  ClipboardList,
  FileOutput,
  LayoutTemplate,
  MessageSquareText,
  Play,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/** Colour role of a preview line or status; maps to the palette tokens in globals.css. */
export type Tone = "muted" | "foreground" | "primary" | "success" | "accent";

export type PreviewLine = {
  text: string;
  tone?: Tone;
  /** right-aligned status, e.g. a check result */
  status?: { label: string; tone: Tone };
  /** a row of chips instead of plain text (e.g. the four templates) */
  chips?: { label: string; active?: boolean }[];
};

export type WorkflowStep = {
  id: string;
  /** one word on the rail */
  label: string;
  icon: LucideIcon;
  title: string;
  body: string;
  detail: string[];
  /** a terminal-style mock of what the user sees at this step (fake data only) */
  preview: { title: string; lines: PreviewLine[] };
  /** the human approval gate: amber everywhere, even when not selected */
  gate?: boolean;
  /** extra callout under the bullets (Execution: the second approval point) */
  note?: string;
};

/**
 * The seven steps of an assessment, shown by WorkflowStepper. Copy must stay in
 * step with showcase-data.ts and docs/architecture: no claims beyond those.
 * Preview data is illustrative only (example.com / RFC 5737 addresses).
 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "request",
    label: "Request",
    icon: MessageSquareText,
    title: "Describe the task",
    body: "Tell Reconix what you want assessed, in plain language, right in the terminal.",
    detail: [
      "No command syntax: describe the target and what you want checked",
      "The request and a template together become the draft scope",
      "Nothing runs at this point",
    ],
    preview: {
      title: "reconix · terminal",
      lines: [
        { text: "> scan the staging API for auth issues", tone: "foreground" },
        { text: "request noted", tone: "muted", status: { label: "no action", tone: "muted" } },
        { text: "next: choose a template", tone: "primary" },
      ],
    },
  },
  {
    id: "template",
    label: "Template",
    icon: LayoutTemplate,
    title: "Choose a template",
    body: "Automatic or pick manully one of four templates: Network, API, Source Code or Web URL.",
    detail: [
      "Each template asks for the inputs it needs: hosts, endpoints, a repository or a URL",
      "Selecting a template never authorizes testing on its own",
    ],
    preview: {
      title: "reconix · template",
      lines: [
        { text: "", chips: [{ label: "Network" }, { label: "API", active: true }, { label: "Source Code" }, { label: "Web URL" }] },
        { text: "inputs: endpoints and schema", tone: "muted" },
        { text: "authorization: none yet", tone: "muted", status: { label: "not approved", tone: "accent" } },
      ],
    },
  },
  {
    id: "scope",
    label: "Scope",
    icon: ClipboardList,
    title: "Prepare the Scope Manifest",
    body: "Reconix drafts the scope from the template and your answers. You adjust targets, permitted actions, exclusions and limits.",
    detail: [
      "Targets and exclusions are explicit, nothing is inferred later",
      "Permitted actions and assessment limits are part of the manifest",
      "You can edit it before anything runs",
    ],
    preview: {
      title: "scope-manifest.yaml",
      lines: [
        { text: "targets:", tone: "primary" },
        { text: "  - https://staging.example.com/api", tone: "foreground" },
        { text: "permitted: [discovery, auth-checks]", tone: "foreground" },
        { text: "exclusions: [/api/admin/*]", tone: "foreground" },
        { text: "limits: 5 req/s · 2h window", tone: "foreground" },
        { text: "status: draft", tone: "muted", status: { label: "awaiting approval", tone: "accent" } },
      ],
    },
  },
  {
    id: "approval",
label: "Approval",
icon: ShieldCheck,
title: "Approve the scope",
body: "Review the final Scope Manifest and explicitly approve it before any testing begins.",

detail: [
  "Every target, tool, and restriction is checked against the approved scope",
  "No security tool can start until explicit approval is given",
  "Changes to the scope require a new review and approval",
  "Approval is recorded in the audit trail for accountability",
],
    gate: true,
    preview: {
      title: "approval required",
      lines: [
        { text: "Scope Manifest v1 · 1 target · 2 actions", tone: "foreground" },
        { text: "testing", tone: "muted", status: { label: "blocked until approved", tone: "accent" } },
        { text: "", chips: [{ label: "approve", active: true }, { label: "edit" }] },
      ],
    },
  },
  {
    id: "execution",
label: "Execution",
icon: Play,
title: "Validate and run actions",
body: "Every proposed action is validated against inputs, scope, command rules, risk level, and execution limits before an approved tool can run.",

detail: [
  "Validation happens for every action, not just once per assessment",
  "Only approved tools and permitted commands can execute",
  "Out-of-scope or invalid actions are blocked before execution",
  "Execution results and failures are recorded in the audit",
],

note: "Higher-risk actions pause and require explicit approval before continuing.",
    preview: {
      title: "reconix · checks",
      lines: [
        { text: "input check", tone: "foreground", status: { label: "pass", tone: "success" } },
        { text: "scope check", tone: "foreground", status: { label: "pass", tone: "success" } },
        { text: "command check", tone: "foreground", status: { label: "pass", tone: "success" } },
        { text: "risk check", tone: "foreground", status: { label: "paused for approval", tone: "accent" } },
        { text: "limit check", tone: "muted", status: { label: "waiting", tone: "muted" } },
      ],
    },
  },
  {
   id: "findings",
label: "Findings",
icon: ScanSearch,
title: "Analyze findings",
body: "Tool results are classified, correlated, prioritized, and explained with supporting evidence and trusted security knowledge.",

detail: [
  "Related results from multiple tools are correlated into consistent findings",
  "Severity and confidence are derived from scanner data, CVSS, and defined policy rules",
  "Impact and remediation are enriched with OWASP, CWE, CVE/NVD, and internal knowledge",
  "Uncertain findings are flagged for human review instead of being silently accepted",
],
    preview: {
      title: "finding F-003",
      lines: [
        { text: "Broken authentication on /api/session", tone: "foreground", status: { label: "high", tone: "accent" } },
        { text: "CWE-287 · Improper Authentication", tone: "primary" },
        { text: "evidence: request + response", tone: "muted", status: { label: "masked", tone: "success" } },
        { text: "token: eyJh••••••••", tone: "muted" },
      ],
    },
  },
  {
  id: "report",
  label: "Report",
  icon: FileOutput,
  title: "Generate the report",
  body: "Create a review-ready security report with the approved scope, validated findings, supporting evidence, limitations, and recommended remediation.",

  detail: [
    "Every report includes the approved scope and assessment boundaries",
    "Findings include severity, evidence, validation status, impact, and remediation",
    "Known limitations and unresolved items are clearly documented",
    "The local viewer provides access to findings, evidence, audit history, and generated reports",
    "Reports can be exported for handoff, review, or compliance documentation",
  ],
   preview: {
      title: "report.pdf",
      lines: [
        { text: "1  Scope", tone: "foreground" },
        { text: "2  Findings", tone: "foreground", status: { label: "3", tone: "primary" } },
        { text: "3  Evidence", tone: "foreground" },
        { text: "4  Limitations", tone: "foreground" },
        { text: "5  Recommended fixes", tone: "foreground" },
        { text: "→ open in local viewer", tone: "primary" },
      ],
    },
  },
];
