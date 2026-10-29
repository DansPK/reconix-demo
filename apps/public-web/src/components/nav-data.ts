import { LayoutGrid, Network, Puzzle, Route, Sparkles, Target, type LucideIcon } from "lucide-react";
import { DOCS_NAV } from "@/lib/docs-nav";

export type NavItem = { label: string; href: string; description: string; icon?: LucideIcon };

export type NavMenu = {
  id: string;
  label: string;
  /** where the menu's name itself points (footer one-line nav) */
  href: string;
  items: NavItem[];
  /** panel columns on desktop */
  columns: 1 | 2;
  /** optional link at the bottom of the panel */
  footer?: { label: string; href: string };
};

const guardrails = DOCS_NAV.find((g) => g.id === "guardrails")!;

/**
 * The navbar's four dropdowns. Features / How it works point at landing-page sections
 * (short, "what Reconix can do"); Guardrails / Docs point at the docs (detail), built from DOCS_NAV.
 */
export const NAV_MENUS: NavMenu[] = [
  {
    id: "features",
    label: "Features",
    href: "/#showcase",
    columns: 2,
    items: [
      { label: "Purpose", href: "/#hero", description: "AI-planned security assessments inside an approved scope.", icon: Target },
      { label: "Key features", href: "/#showcase", description: "Scope, policy, tools, analysis, knowledge and reports.", icon: Sparkles },
      { label: "Integrations", href: "/#integrations", description: "The approved tools and the stack you run yourself.", icon: Puzzle },
      { label: "Assessment categories", href: "/#categories", description: "Network, API, Source Code and Web URL.", icon: LayoutGrid },
    ],
  },
  {
    id: "how",
    label: "How it works",
    href: "/#workflow",
    columns: 1,
    items: [
      { label: "Assessment flow", href: "/#workflow", description: "Seven steps, one approval gate you can't skip.", icon: Route },
      { label: "Architecture", href: "/docs/architecture", description: "Terminal, backend, AI service and tool service.", icon: Network },
    ],
  },
  {
    id: "guardrails",
    label: "Guardrails",
    href: guardrails.href,
    columns: 2,
    items: guardrails.pages.map((p) => ({ label: p.title, href: p.href, description: p.description })),
  },
  {
    id: "docs",
    label: "Docs",
    href: "/docs",
    columns: 2,
    items: DOCS_NAV.map((g) => ({ label: g.title, href: g.href, description: g.description, icon: g.icon })),
    footer: { label: "Browse all docs", href: "/docs" },
  },
];
