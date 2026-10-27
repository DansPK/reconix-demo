/* A checkbox with its label as one control (the report's run selection). A native input, so
   the keyboard, screen readers and forms all work; `reason` explains a disabled one (the
   tooltip and the accessible description). */
import { useId } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: React.ReactNode;
  reason?: string; // why it is disabled
  className?: string;
}

export function Checkbox({ label, reason, className, disabled, "aria-describedby": describedBy, ...props }: CheckboxProps) {
  const id = useId();
  const hint = reason && disabled ? `${id}-reason` : undefined;
  // the caller's description and the reason it is disabled are both read, never one over the other
  const described = [describedBy, hint].filter(Boolean).join(" ") || undefined;
  return (
    <label htmlFor={id} className={cn("ui-check", disabled && "is-disabled", className)} title={disabled ? reason : undefined}>
      <input id={id} type="checkbox" disabled={disabled} {...props} aria-describedby={described} className="ui-check-input" />
      <span className="ui-check-box" aria-hidden />
      <span className="min-w-0">{label}</span>
      {hint && (
        <span id={hint} className="sr-only">
          {reason}
        </span>
      )}
    </label>
  );
}
