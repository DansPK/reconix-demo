/* A status as a badge: icon, label and colour together, with the meaning as its tooltip (see
   src/lib/status.ts). Never colour alone. SeverityBadge does the same for a severity. */
import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Hand,
  Hourglass,
  Loader,
  MinusCircle,
  PauseCircle,
  ShieldCheck,
  ShieldX,
  Square,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type IconName, type Meaning, SEVERITY_META, toneColor } from "@/lib/status";
import type { Severity } from "@/lib/data/schema";

const ICONS: Record<IconName, LucideIcon> = {
  new: Circle,
  running: Loader,
  waiting: Hand,
  done: CheckCircle2,
  stopped: Square,
  interrupted: PauseCircle,
  planned: CircleDashed,
  allowed: ShieldCheck,
  blocked: ShieldX,
  approved: CheckCircle2,
  rejected: XCircle,
  pending: Hourglass,
  unreached: MinusCircle,
  confirmed: CheckCircle2,
  review: CircleDot,
  closed: MinusCircle,
  severity: TriangleAlert,
};

const BADGE = "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium leading-none";

function Badge({ color, icon, label, hint, className }: { color: string; icon: IconName; label: string; hint: string; className?: string }) {
  const Icon = ICONS[icon];
  return (
    <span
      title={hint}
      className={cn(BADGE, className)}
      style={{ color, background: `color-mix(in oklab, ${color} 13%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 28%, transparent)` }}
    >
      <Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

export function StatusBadge({ meaning, label, className }: { meaning: Meaning; label?: string; className?: string }) {
  return <Badge color={toneColor(meaning.tone)} icon={meaning.icon} label={label ?? meaning.label} hint={meaning.hint} className={className} />;
}

export function SeverityBadge({ level, className }: { level: Severity; className?: string }) {
  const m = SEVERITY_META[level];
  return <Badge color={m.color} icon="severity" label={m.label} hint={`${m.label}: ${m.hint}`} className={className} />;
}
