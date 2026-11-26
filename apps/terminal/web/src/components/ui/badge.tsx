import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary/10 text-primary",
        /** approval gates and MEDIUM / HIGH risk */
        accent: "border-accent/40 bg-accent/10 text-accent",
        /** pass states and LOW risk */
        success: "border-success/40 bg-success/10 text-success",
        /** CRITICAL / HIGH finding severity (product previews only) */
        danger: "border-danger/40 bg-danger/10 text-danger",
        muted: "border-border bg-muted text-muted-foreground",
        outline: "border-border bg-card/70 text-foreground",
        /** live-status pill with a pulsing dot (hero) */
        status:
          "border-border bg-card/70 text-muted-foreground before:mr-2 before:inline-block before:size-1.5 before:rounded-full before:bg-primary before:content-[''] motion-safe:before:animate-pulse",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
