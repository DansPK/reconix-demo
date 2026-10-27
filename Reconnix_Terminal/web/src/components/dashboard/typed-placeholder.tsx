"use client";

import { useEffect, useState } from "react";


/**
 * Cycling typed placeholder shown over the (placeholder-less) ask input. Types a question at
 * 38ms/char, holds 2.2s, deletes at 18ms/char, then moves on. Hidden while the input is focused
 * or has text (and the loop pauses), including text set from outside (`filled`: a draft shared
 * with the AI Assistant). Under reduced motion it shows the first question statically.
 */
export function TypedPlaceholder({
  inputRef,
  questions,
  filled = false,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  questions: string[]; // about the open run (derive.ts), at least one
  filled?: boolean; // the field holds text
}) {
  // A string key, so a live refresh with the same questions doesn't restart the animation.
  const key = (questions.length ? questions : ["Ask about this assessment"]).join("\n");
  const [text, setText] = useState(key.split("\n")[0]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const QUESTIONS = key.split("\n");
    const input = inputRef.current;
    if (!input) return;
    const inUse = () => document.activeElement === input || input.value.length > 0;
    const sync = () => setHidden(inUse());
    input.addEventListener("focus", sync);
    input.addEventListener("blur", sync);
    input.addEventListener("input", sync);
    // (no synchronous sync() here: an empty, unfocused field starts showing the placeholder,
    // which is the initial state; the listeners handle every change.)

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // text already starts at QUESTIONS[0]; nothing to animate.
      return () => {
        input.removeEventListener("focus", sync);
        input.removeEventListener("blur", sync);
        input.removeEventListener("input", sync);
      };
    }

    let qi = 0;
    let ci = 0;
    let deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const schedule = (ms: number) => {
      t = setTimeout(tick, ms);
    };
    const tick = () => {
      if (inUse()) return schedule(400); // paused while the field is in use
      const q = QUESTIONS[qi];
      if (!deleting) {
        ci++;
        setText(q.slice(0, ci));
        if (ci >= q.length) {
          deleting = true;
          return schedule(2200);
        }
        return schedule(38);
      }
      ci--;
      setText(q.slice(0, ci));
      if (ci <= 0) {
        deleting = false;
        qi = (qi + 1) % QUESTIONS.length;
        return schedule(300);
      }
      schedule(18);
    };
    schedule(900);

    return () => {
      clearTimeout(t);
      input.removeEventListener("focus", sync);
      input.removeEventListener("blur", sync);
      input.removeEventListener("input", sync);
    };
  }, [inputRef, key]);

  if (hidden || filled) return null;
  return (
    <span className="pointer-events-none absolute inset-0 flex min-w-0 items-center text-sm text-muted-foreground" aria-hidden>
      <span className="truncate">{text}</span>
    </span>
  );
}
