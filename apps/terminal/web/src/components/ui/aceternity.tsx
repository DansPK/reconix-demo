/* Aceternity UI–inspired visual primitives (Spotlight, BackgroundBeams, MovingBorder,
   BackgroundGrid), built with pure Tailwind CSS v4 + Reconix theme tokens (zero extra npm
   dependencies, reduced-motion safe, decorative / aria-hidden). */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ambient SVG spotlight beam draped across a dark hero surface (Aceternity Spotlight). */
export function Spotlight({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 3787 2842"
      fill="none"
      className={cn(
        "ac-spotlight pointer-events-none absolute -top-28 left-1/2 z-0 h-[150%] w-[150%] -translate-x-1/2 opacity-0",
        className,
      )}
    >
      <g filter="url(#ac-spotlight-blur)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill="var(--primary)"
          fillOpacity="0.24"
        />
      </g>
      <defs>
        <filter id="ac-spotlight-blur" x="0.86" y="0.84" width="3785.16" height="2840.26" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
}

/** Animated diagonal light beams sweeping behind hero areas (Aceternity Background Beams). */
export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      className={cn("ac-beams pointer-events-none absolute inset-0 z-0 h-full w-full", className)}
    >
      <defs>
        <linearGradient id="ac-beam-a" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--globe-glow)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ac-beam-b" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--info)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="ac-beam-line ac-beam-1" d="M-40 60 Q 260 140 840 20" stroke="url(#ac-beam-a)" strokeWidth="1.25" />
      <path className="ac-beam-line ac-beam-2" d="M-60 220 Q 380 120 860 260" stroke="url(#ac-beam-a)" strokeWidth="1" />
      <path className="ac-beam-line ac-beam-3" d="M840 90 Q 420 220 -40 330" stroke="url(#ac-beam-b)" strokeWidth="1.15" />
    </svg>
  );
}

/** Subtle radial-masked dot-grid backdrop for hero areas (Aceternity Background Grid). */
export function BackgroundGrid({ className }: { className?: string }) {
  return <div aria-hidden className={cn("ac-bg-grid pointer-events-none absolute inset-0 z-0", className)} />;
}

/** Animated conic-gradient moving border wrapper (Aceternity Moving Border). */
export function MovingBorder({
  children,
  className,
  innerClassName,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ac-moving-border", className)} {...rest}>
      <div className={cn("ac-moving-border-inner", innerClassName)}>{children}</div>
    </div>
  );
}
