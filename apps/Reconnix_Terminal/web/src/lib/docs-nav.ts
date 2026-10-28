import {
  FileText,
  LifeBuoy,
  Rocket,
  ShieldCheck,
  SquareTerminal,
  Target,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

import commandsJson from "@/content/docs/commands.json";

/** One page of a group: a titled part of the group's page, at the anchor `#<slug>`. */
export type DocPage = {
  title: string;
  /** the anchor on the group's page (also the content key in src/content/docs/<group>.tsx) */
  slug: string;
  /** `/docs/<group>#<slug>` */
  href: string;
  description: string;
};

export type DocGroup = {
  /** url segment under /docs (also the content key in src/content/docs) */
  id: string;
  title: string;
  /** the group's page, `/docs/<id>`: every page of the group, in order */
  href: string;
  description: string;
  icon: LucideIcon;
  pages: DocPage[];
};

type GroupSpec = Omit<DocGroup, "href" | "pages"> & { pages: Omit<DocPage, "href">[] };

/** One slash command as `scripts/export_commands.py` wrote it (the TUI's `Command`). */
export type CommandEntry = {
  name: string;
  aliases: string[];
  description: string;
  /** the argument is picked from a list */
  takes_argument: boolean;
  /** a missing argument opens that list as a menu (false: the list only suggests) */
  ask: boolean;
  question: string;
  empty: string;
};

export type CommandGroup = { id: string; title: string; commands: CommandEntry[] };

/**
 * The generated command reference: every command of `reconix/commands/builtin.py`, grouped by
 * area. Regenerate with `python scripts/export_commands.py`; `tests/test_export_commands.py`
 * fails when the file is stale.
 */
export const COMMAND_GROUPS: CommandGroup[] = commandsJson.groups;

export const COMMANDS: CommandEntry[] = COMMAND_GROUPS.flatMap((g) => g.commands);

/**
 * The docs structure, single source of truth for the docs sidebar, the group pages, "On this
 * page", the search and the dashboard's docs links. Each group is ONE page (`/docs/<id>`) that
 * shows all of its pages, in this order, as titled parts; a page's address is its anchor on that
 * page, `/docs/<id>#<slug>`. Adding a page = add it here and its content to
 * src/content/docs/<group>.tsx under the same slug. The Commands group's pages come from the
 * generated reference (one per command). The old address of a page, `/docs/<id>/<slug>`,
 * redirects to its anchor (lib/docs-redirects.ts).
 */
const GROUPS: GroupSpec[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "What Reconix is, how to install and launch it, and a first assessment on the example target.",
    icon: Rocket,
    pages: [
      { title: "Introduction", slug: "introduction", description: "What Reconix does, what is simulated and what is real." },
      { title: "Requirements", slug: "requirements", description: "Python, a terminal, and the optional pieces for PDF, the dashboard and a model." },
      { title: "Installation", slug: "installation", description: "Clone, create a virtual environment, install." },
      { title: "Launching", slug: "launching", description: "python -m reconix, the reconix command and run.py." },
      { title: "First steps", slug: "first-steps", description: "A first assessment on the example target, gate by gate." },
    ],
  },
  {
    id: "terminal-guide",
    title: "Terminal guide",
    description: "The eight screens, the keys and the slash-command bar.",
    icon: SquareTerminal,
    pages: [
      { title: "The screens", slug: "screens", description: "Start, Template, Plan, Approval, Execution, Findings, Finding Detail and Report." },
      { title: "Keys", slug: "keys", description: "The keys that work everywhere and the ones each screen adds." },
      { title: "The command bar", slug: "command-bar", description: "Slash commands, Tab completion, history and Ctrl+R." },
      { title: "The prompt", slug: "prompt", description: "What a typed line does: a target, a question, a command or a path." },
    ],
  },
  {
    id: "commands",
    title: "Commands",
    description: "Every slash command: purpose, syntax, an example, what happens and its errors.",
    icon: TerminalSquare,
    pages: COMMANDS.map((c) => ({ title: `/${c.name}`, slug: c.name, description: c.description })),
  },
  {
    id: "assessment-guide",
    title: "Security assessment guide",
    description: "From a typed request to findings: scope, plan, tools, policy checks, approval gates and execution.",
    icon: Target,
    pages: [
      { title: "Request and template", slug: "request", description: "A target picks a template; four templates cover web, API, network and source code." },
      { title: "Scope manifest", slug: "scope", description: "What a scope allows, how to edit it, what approving it locks." },
      { title: "Plan and tools", slug: "plan", description: "The phases, the target login the tools need, and the gated steps." },
      { title: "Policy checks", slug: "policy-checks", description: "Every request is checked against the approved scope before it runs." },
      { title: "Approval gates", slug: "approval-gates", description: "MEDIUM: one decision. HIGH: a double check with a single-use token and the request hash." },
      { title: "Execution", slug: "execution", description: "The live run, its pauses, and stopping it." },
      { title: "Findings", slug: "findings", description: "How findings appear, and how the run ends." },
      { title: "The AI agent", slug: "ai-agent", description: "/assess with a model: a real assessment through the same gates." },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    description: "Review the results, understand the findings, export from the terminal or the dashboard.",
    icon: FileText,
    pages: [
      { title: "Reviewing results", slug: "reviewing", description: "The Report screen, the summary and the audit trail." },
      { title: "Understanding findings", slug: "understanding-findings", description: "Severity, validation, CVSS, triage, filters and imports." },
      { title: "Exporting", slug: "exporting", description: "PDF, JSON and DOCX from the terminal, saved under ./reports/." },
      { title: "The web dashboard", slug: "dashboard", description: "Single downloads, the preview, and the combined report of up to five runs." },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "What each error means and what to do about it.",
    icon: LifeBuoy,
    pages: [
      { title: "Model connection", slug: "model-connection", description: "Unreachable providers, bad keys, timeouts." },
      { title: "Missing tools", slug: "missing-tools", description: "No Chrome for the PDF, no python-docx, no harness." },
      { title: "Policy errors", slug: "policy-errors", description: "Blocked requests and refused edits." },
      { title: "Unknown commands", slug: "unknown-commands", description: "Typos, the path rule, and commands that need a run." },
      { title: "Report failures", slug: "report-failures", description: "When an export is refused or can't be written." },
      { title: "The web dashboard", slug: "web-dashboard", description: "/web can't start: ports, Node and the log." },
    ],
  },
  {
    id: "guardrails",
    title: "Guardrails",
    description: "The rules that keep an assessment inside what you approved.",
    icon: ShieldCheck,
    pages: [
      { title: "Authorized use", slug: "authorized-use", description: "Only assess what you may test." },
      { title: "Scope & safety", slug: "scope-and-safety", description: "The scope check, canonical paths and untrusted data." },
      { title: "Approval model", slug: "approval-model", description: "The scope once, every risky action, and the HIGH double check." },
      { title: "Credential handling", slug: "credential-handling", description: "Logins in memory, codes never stored, secrets masked everywhere." },
      { title: "LLM data handling", slug: "llm-data-handling", description: "What a model sees, what it never decides." },
      { title: "Limitations", slug: "limitations", description: "What Reconix does not do." },
    ],
  },
];

/** A group's page: `/docs/<id>`. */
export const groupHref = (id: string) => `/docs/${id}`;

export const DOCS_NAV: DocGroup[] = GROUPS.map((g) => {
  const href = groupHref(g.id);
  return { ...g, href, pages: g.pages.map((p) => ({ ...p, href: `${href}#${p.slug}` })) };
});

/** The group `/docs` itself shows (no redirect: the same page at the docs' own address). */
export const DOCS_HOME_GROUP = "getting-started";

/** The group a docs path shows: `/docs` → Getting started, `/docs/<id>` → that group. */
export function docsGroupOf(pathname: string): DocGroup | undefined {
  const id = pathname === "/docs" ? DOCS_HOME_GROUP : pathname.match(/^\/docs\/([a-z0-9-]+)$/)?.[1];
  return DOCS_NAV.find((g) => g.id === id);
}

export type DocEntry = DocPage & { group: DocGroup; isGroup: boolean };

/** Every docs address in reading order: each group's page, then its pages' anchors. */
export const DOCS_ENTRIES: DocEntry[] = DOCS_NAV.flatMap((g) => [
  { title: g.title, slug: g.id, href: g.href, description: g.description, group: g, isGroup: true },
  ...g.pages.map((p) => ({ ...p, group: g, isGroup: false })),
]);

/** The docs' routes: `/docs` and one page per group (a page of a group is an anchor on it). */
export const DOCS_ROUTES: string[] = ["/docs", ...DOCS_NAV.map((g) => g.href)];

/**
 * Whether `href` is a live docs address: a docs route, optionally with the anchor of one of the
 * pages that route shows. (Section anchors, `#<page>-<section>`, are checked by the tests
 * against the content: lib/docs-search-index.ts.)
 */
export function isDocsAddress(href: string): boolean {
  const [path, anchor] = href.split("#", 2);
  if (!DOCS_ROUTES.includes(path)) return false;
  if (anchor === undefined) return true;
  return docsGroupOf(path)?.pages.some((p) => p.slug === anchor) ?? false;
}

/**
 * The docs pages the dashboard links to, by meaning. Components link through this map, never
 * through a string literal, so the docs can move again by changing one place; the tests check
 * that every address here is live (isDocsAddress).
 */
export const DOCS = {
  home: "/docs",
  gettingStarted: "/docs/getting-started",
  introduction: "/docs/getting-started#introduction",
  assessmentGuide: "/docs/assessment-guide",
  request: "/docs/assessment-guide#request",
  scope: "/docs/assessment-guide#scope",
  plan: "/docs/assessment-guide#plan",
  policyChecks: "/docs/assessment-guide#policy-checks",
  approvalGates: "/docs/assessment-guide#approval-gates",
  approvalModel: "/docs/guardrails#approval-model",
  llmData: "/docs/guardrails#llm-data-handling",
  screens: "/docs/terminal-guide#screens",
  findings: "/docs/reports#understanding-findings",
  exporting: "/docs/reports#exporting",
  dashboard: "/docs/reports#dashboard",
  knowledge: "/docs/reports#dashboard", // the dashboard and its Security knowledge page
} as const;
export type DocsLink = (typeof DOCS)[keyof typeof DOCS];
