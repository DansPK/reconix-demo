import {
  FileText,
  LayoutDashboard,
  ShieldAlert,
  SlidersHorizontal,
  SquareTerminal,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { AsciiBanner } from "@/components/ascii-banner";
import { SectionShell } from "@/components/section-shell";
import { ProductTabs, type ProductView } from "@/components/product-tabs";
import {
  DashboardScreen,
  ExecutionScreen,
  FindingsScreen,
  ReportScreen,
  ScopeScreen,
} from "@/components/product-preview/screens";

const icon = { strokeWidth: 1.6, "aria-hidden": true } as const;

const VIEWS: ProductView[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    surface: "dashboard",
    icon: <LayoutDashboard {...icon} />,
    caption:
      "A run at a glance: progress, tool execution, findings by severity and the top risks.",
    screen: <DashboardScreen />,
  },
  {
    id: "scope",
    label: "Scope",
    surface: "terminal",
    icon: <SlidersHorizontal {...icon} />,
    caption:
      "The agent drafts a scope manifest from a template: the target, what it may do and which tools. Nothing runs until you approve it.",
    screen: <ScopeScreen />,
  },
  {
    id: "execution",
    label: "Execution",
    surface: "terminal",
    icon: <SquareTerminal {...icon} />,
    caption:
      "Every action is checked live: LOW runs, excluded targets are blocked, MEDIUM waits for you.",
    screen: <ExecutionScreen />,
  },
  {
    id: "findings",
    label: "Findings",
    surface: "dashboard",
    icon: <ShieldAlert {...icon} />,
    caption:
      "Search or filter, then open a finding for its CWE, description, impact, masked evidence and remediation.",
    screen: <FindingsScreen />,
  },
  {
    id: "report",
    label: "Report",
    surface: "dashboard",
    icon: <FileText {...icon} />,
    caption:
      "Executive summary, approved scope, findings and fixes in one report, exported as PDF, DOCX or JSON.",
    screen: <ReportScreen />,
  },
];

export function ProductPreview() {
  return (
    <SectionShell id="product" backdrop="glow" tint="primary">
      <Reveal className="mb-10 max-w-3xl space-y-4">
        <p
          data-reveal
          className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary"
        >
          Product tour
        </p>
        <div data-reveal>
          <AsciiBanner text="In action" />
        </div>
        <h2
          data-reveal
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          See Reconix in action.
        </h2>
        <p
          data-reveal
          className="text-base leading-relaxed text-foreground/90 sm:text-lg"
        >
          From defining the scope to reading findings and exporting the report,
          one assessment in the terminal where you approve and the dashboard where
          you review.
        </p>
      </Reveal>
      <Reveal stagger={0.12}>
        <ProductTabs views={VIEWS} />
      </Reveal>
    </SectionShell>
  );
}
