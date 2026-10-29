import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tones = {
  primary: "text-primary",
  accent: "text-accent", // reserved for approval-gate states, e.g. "policy ▸ awaiting approval"
  success: "text-success",
} as const;

export type StatusChipProps = {
  label: string;
  value: string;
  tone?: keyof typeof tones;
  className?: string;
};

/** Small mono readout like `SCOPE ▸ approved`, built on the outline Badge. */
export function StatusChip({ label, value, tone = "primary", className }: StatusChipProps) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-md normal-case tracking-[0.12em]", className)}>
      <span className="uppercase text-muted-foreground">{label}</span>
      <span aria-hidden className="text-muted-foreground/60">
        ▸
      </span>
      <span className={cn("font-semibold", tones[tone])}>{value}</span>
    </Badge>
  );
}
