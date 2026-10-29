import type { ReactNode } from "react";
import { FileText, FolderKanban, ScrollText, ShieldAlert, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Risk, Severity } from "@/components/product-preview/data";

/** Window dots + title strip shared by both surfaces. */
function TitleBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background/70 px-4 py-2.5">
      <span aria-hidden className="flex shrink-0 gap-1.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-primary/80" />
      </span>
      <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{children}</div>
      {right}
    </div>
  );
}

/** The Reconix terminal (Textual TUI): dark, mono, with an optional status bar. */
export function TerminalWindow({ title, status, children }: { title: string; status?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-window">
      <TitleBar>
        <span className="text-foreground">reconix</span> · {title}
      </TitleBar>
      <div className="app-terminal p-4 font-mono text-[12px] leading-relaxed sm:p-5 sm:text-[13px]">{children}</div>
      {status && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-background/70 px-4 py-2 font-mono text-[11px] text-muted-foreground">
          {status}
        </div>
      )}
    </div>
  );
}

type NavKey = "assessments" | "scope" | "findings" | "audit" | "reports";
const NAV: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: "assessments", label: "Assessments", icon: FolderKanban },
  { key: "scope", label: "Scope", icon: SlidersHorizontal },
  { key: "findings", label: "Findings", icon: ShieldAlert },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "reports", label: "Reports", icon: FileText },
];

/** The read-only local viewer: browser window, sidebar from md up. */
export function ViewerWindow({ path, active, children }: { path: string; active: NavKey; children: ReactNode }) {
  return (
    <div className="app-window">
      <TitleBar right={<span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">read-only</span>}>
        <span className="rounded-md border border-border bg-card px-2.5 py-0.5">localhost:3000{path}</span>
      </TitleBar>
      <div className="flex">
        <nav aria-hidden className="hidden w-44 shrink-0 border-r border-border bg-background/40 p-3 md:block">
          <p className="mb-4 px-2 font-mono text-xs">
            <span className="text-muted-foreground">&lt;</span>
            <span className="font-semibold">reconix</span>
            <span className="text-muted-foreground"> /&gt;</span>
          </p>
          <ul className="space-y-0.5 text-[13px]">
            {NAV.map(({ key, label, icon: Icon }) => (
              <li
                key={key}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-muted-foreground",
                  key === active && "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)]"
                )}
              >
                <Icon className={cn("size-4", key === active && "text-primary")} aria-hidden strokeWidth={1.75} />
                {label}
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 bg-card/50 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---- small shared pieces ---- */

const SEVERITY_VARIANT = { CRITICAL: "danger", HIGH: "danger", MEDIUM: "accent", LOW: "success" } as const;
/** solid swatch per level, for bars and legends */
export const SEVERITY_FILL: Record<Severity, string> = {
  CRITICAL: "bg-danger",
  HIGH: "bg-danger/55",
  MEDIUM: "bg-accent",
  LOW: "bg-success/80",
};

export function SeverityBadge({ level, className }: { level: Severity; className?: string }) {
  return (
    <Badge
      variant={SEVERITY_VARIANT[level]}
      className={cn("justify-center px-2 text-[10px]", level === "CRITICAL" && "border-danger bg-danger/20", className)}
    >
      {level}
    </Badge>
  );
}

export function RiskBadge({ level }: { level: Risk }) {
  return (
    <Badge variant={level === "LOW" ? "success" : "accent"} className="px-2 text-[10px]">
      {level}
    </Badge>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}

/** Proportional severity bar + legend. */
export function SeverityBar({ data }: { data: { level: Severity; count: number }[] }) {
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {data.map((s) => (
          <div key={s.level} className={SEVERITY_FILL[s.level]} style={{ flexGrow: s.count }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        {data.map((s) => (
          <li key={s.level} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", SEVERITY_FILL[s.level])} />
            {s.level} <span className="text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small uppercase mono label used for field names inside the screens. */
export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground", className)}>{children}</p>
  );
}
