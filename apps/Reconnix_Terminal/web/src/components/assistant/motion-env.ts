/* What the assistant's transition needs to know about where it runs, shared by the stage and its
   hooks: reduced motion, and whether the fixed-height desktop frame is there (frame.css), which
   the grow/shrink needs (elsewhere it crossfades). Browser only. */

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const roomy = () => window.matchMedia("(min-width: 1280px) and (min-height: 760px)").matches;

/** Where the assistant is: off, coming in, open (settled), going away. */
export type Phase = "closed" | "opening" | "open" | "closing";
