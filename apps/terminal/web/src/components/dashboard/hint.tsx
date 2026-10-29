"use client";

/* A toggletip: something with a short explanation that a mouse, the keyboard and touch can all
   reach. Hover, focus or a tap shows the explanation as the charts' tooltip; leaving, blurring
   or Esc hides it. Screen readers get the explanation as part of the button's name. */
import { ChartTooltip, useTip } from "@/components/dashboard/chart-tooltip";
import { cn } from "@/lib/utils";

export function Hint({ title, text, className, children }: { title: string; text: string; className?: string; children: React.ReactNode }) {
  const { tip, show, hide } = useTip();
  const open = (e: React.SyntheticEvent<HTMLElement>) => show(e.currentTarget, title, [text]);
  return (
    <>
      <button
        type="button"
        className={cn("dash-hint", className)}
        onMouseEnter={open}
        onMouseLeave={hide}
        onFocus={open}
        onBlur={hide}
        onClick={open}
      >
        {children}
        <span className="sr-only">: {text}</span>
      </button>
      <ChartTooltip tip={tip} />
    </>
  );
}
