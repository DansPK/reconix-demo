/* The one button: a variant for its weight (primary, outline, quiet) and a size. The dashboard's
   controls are `md` (32 px: the report's actions) and `xs` (28 px: the pager, Retry, Copy); the
   docs chrome's calls to action are `sm` and `lg`. A button that must keep focus while it can't
   act uses aria-disabled (the hover styles then stay off too); one that may lose it, disabled. */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground not-aria-disabled:hover:bg-primary-strong",
        outline: "border border-border text-foreground not-aria-disabled:hover:border-primary/40 not-aria-disabled:hover:text-primary",
        quiet: "text-muted-foreground not-aria-disabled:hover:bg-foreground/6 not-aria-disabled:hover:text-foreground",
      },
      size: {
        xs: "h-7 rounded-lg px-2.5 text-[12px]",
        md: "h-8 rounded-[10px] px-3 text-[12.5px]",
        sm: "h-9 rounded-md px-4 text-sm font-medium",
        lg: "h-12 rounded-md px-7 text-base font-medium",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
