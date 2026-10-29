import type { SimpleIcon } from "simple-icons";
import {
  siDocker,
  siFastapi,
  siHuggingface,
  siNextdotjs,
  siOwasp,
  siPython,
  siQdrant,
  siRich,
  siTextual,
  siTrivy,
  siTyper,
  siTypescript,
  siVllm,
  siZap,
} from "simple-icons";
import {
  Boxes,
  Braces,
  BrainCircuit,
  Container,
  Crosshair,
  Database,
  KeyRound,
  LayoutDashboard,
  Plug,
  Radar,
  Server,
  ShieldAlert,
  ShieldHalf,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

export type ToolLogoItem = {
  name: string;
  /** one-line role, shown as the small mono caption */
  note: string;
  /** official mark from simple-icons (CC0) when one exists … */
  icon?: SimpleIcon;
  /** … otherwise a lucide glyph that hints at what the tool does */
  glyph?: LucideIcon;
};

export type IntegrationGroup = {
  id: string;
  title: string;
  /** category mark in the card header */
  icon: LucideIcon;
  /** one line under the title: what this layer does in Reconix */
  blurb: string;
  items: ToolLogoItem[];
};

/**
 * The tools Reconix orchestrates and the stack it is built on, grouped by function.
 * Keep this in step with the components table in docs/architecture/page.tsx and the
 * copy in showcase-data.ts: do not list an integration the product story does not claim.
 * To use a vendor's own SVG instead of a glyph, drop it in public/logos/ and render it
 * in tool-logo.tsx; keep the tile size the same.
 */
export type GroupId = "security" | "ai" | "knowledge" | "backend" | "terminal" | "frontend" | "infrastructure";

export const INTEGRATION_GROUPS: (IntegrationGroup & { id: GroupId })[] = [
  {
    id: "security",
    title: "Security tools",
    icon: ShieldHalf,
    blurb: "Run only after the scope and risk policy approve them.",
    items: [
      { name: "Nmap", note: "network discovery", glyph: Radar },
      { name: "Nuclei", note: "template scans", glyph: Crosshair },
      { name: "OWASP ZAP", note: "web · api", icon: siZap },
      { name: "Semgrep", note: "code analysis", glyph: Braces },
      { name: "Gitleaks", note: "secret detection", glyph: KeyRound },
      { name: "Trivy", note: "dependencies · images", icon: siTrivy },
    ],
  },
  {
    id: "ai",
    title: "AI services",
    icon: BrainCircuit,
    blurb: "Language steps only, with short context, never raw tool output.",
    items: [
      { name: "vLLM", note: "local LLM", icon: siVllm },
      { name: "OpenAI-compatible", note: "any endpoint", glyph: Plug },
      { name: "BGE-M3", note: "embeddings", icon: siHuggingface },
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge & data",
    icon: Database,
    blurb: "Hybrid search that grounds findings and remediation.",
    items: [
      { name: "Qdrant", note: "hybrid search", icon: siQdrant },
      { name: "OWASP · CWE", note: "weakness catalog", icon: siOwasp },
      { name: "CVE / NVD", note: "vulnerability feed", glyph: ShieldAlert },
    ],
  },
  {
    id: "backend",
    title: "Backend",
    icon: Server,
    blurb: "Checks every request against the Scope Manifest.",
    items: [
      { name: "FastAPI", note: "scope · policy · audit", icon: siFastapi },
      { name: "Python", note: "services", icon: siPython },
    ],
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: SquareTerminal,
    blurb: "Where you start, approve and review assessments.",
    items: [
      { name: "Typer", note: "cli", icon: siTyper },
      { name: "Textual", note: "tui", icon: siTextual },
      { name: "Rich", note: "output", icon: siRich },
    ],
  },
  {
    id: "frontend",
    title: "Frontend",
    icon: LayoutDashboard,
    blurb: "Read-only local viewer for findings, evidence and reports.",
    items: [
      { name: "Next.js", note: "local viewer", icon: siNextdotjs },
      { name: "TypeScript", note: "dashboard", icon: siTypescript },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    icon: Boxes,
    blurb: "Everything runs on hardware you control.",
    items: [
      { name: "Docker Compose", note: "self-hosted", icon: siDocker },
      { name: "Tool containers", note: "isolated runs", glyph: Container },
    ],
  },
];
