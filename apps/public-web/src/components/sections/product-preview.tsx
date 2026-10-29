import { FileText, LayoutDashboard, ShieldAlert, SlidersHorizontal, SquareTerminal } from "lucide-react";
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

/** Ordered as an assessment runs: overview first, then scope → run → findings → report. */
const VIEWS: ProductView[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    surface: "viewer",
    icon: <LayoutDashboard {...icon} />,
    caption: "One assessment at a glance: target, status, progress, findings by severity and the latest activity.",
    screen: <DashboardScreen />,
  },
  {
    id: "scope",
    label: "Scope",
    surface: "terminal",
    icon: <SlidersHorizontal {...icon} />,
    caption: "Targets, exclusions, permitted actions and limits. Nothing runs until you approve the manifest.",
    screen: <ScopeScreen />,
  },
  {
    id: "execution",
    label: "Execution",
    surface: "terminal",
    icon: <SquareTerminal {...icon} />,
    caption: "Every action is checked live: LOW runs, excluded targets are blocked, MEDIUM waits for you.",
    screen: <ExecutionScreen />,
  },
  {
    id: "findings",
    label: "Findings",
    surface: "viewer",
    icon: <ShieldAlert {...icon} />,
    caption: "Each finding with its impact, masked evidence and a remediation grounded in CWE and OWASP.",
    screen: <FindingsScreen />,
  },
  {
    id: "report",
    label: "Report",
    surface: "viewer",
    icon: <FileText {...icon} />,
    caption: "Results turned into a structured report: summary, risk, severity distribution and fixes, exported as PDF.",
    screen: <ReportScreen />,
  },
];

/**
 * "See Reconix in action": simplified previews of the real terminal and local viewer,
 * built as React components (no screenshots) from the sample run in product-preview/data.ts.
 * The section stays a server component; only the tab switching (ProductTabs) is client code.
 */
export function ProductPreview() {
  return (
    <SectionShell id="product" backdrop="glow" tint="primary">
      <Reveal className="mb-10 max-w-3xl space-y-4">
        <p data-reveal className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">Product tour</p>
        <div data-reveal><AsciiBanner text="In action" /></div>
        <h2 data-reveal className="text-3xl font-semibold tracking-tight sm:text-4xl">See Reconix in action.</h2>
        <p data-reveal className="text-base leading-relaxed text-foreground/90 sm:text-lg">
          From defining the scope to reading findings and exporting the report, one assessment in the
          terminal where you approve and the viewer where you review.
        </p>
      </Reveal>
      <Reveal stagger={0.12}>
        <ProductTabs views={VIEWS} />
      </Reveal>
    </SectionShell>
  );
}
