/* Shared chip trigger and key/value row for the top bar's popovers (server-safe, so
   OverallChips and RunChips stay Server Components and pass RSC children into Popover). */
import { ChevronDown } from "lucide-react";

export const CHIP =
  "flex h-[34px] items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:border-primary/50";

export function ChipTrigger({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="hidden text-muted-foreground sm:inline">{label}:</span>
      <span className="max-w-[120px] truncate text-foreground min-[1440px]:max-w-[140px]">{value}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="tabnums flex min-w-0 items-center gap-1.5 truncate text-foreground">{v}</span>
    </div>
  );
}
