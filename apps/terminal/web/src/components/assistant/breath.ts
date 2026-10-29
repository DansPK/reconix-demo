"use client";

/* One 6-second breathing cycle shared by everything that breathes: the sidebar's AI icon, the
   globe behind the assistant (motion.css) and the glow of a reply's mark while it is written
   (message.tsx). Nothing that holds text breathes: the chat panel and its card stay still (the
   owner's rule: scaled text vibrates while reading).
   Every loop is aligned to the page clock (performance.now() and the document timeline share an
   origin): rest at each multiple of BREATH_MS, the peak half-way, so they swell and settle
   together.

   The assistant's loops run on [data-breath] elements, which the open/close animation never
   moves, so the two never fight. `startBreath` turns them on once the open has settled: each one
   swells from rest right away, reaching the page clock's next peak (at least `lead` ms away),
   and its loop carries on from that peak, in phase and without a jump. `stopBreath` holds each one
   where it is and eases it back to rest when the assistant closes. */
import { useEffect, useState } from "react";
import { gsap } from "gsap";

export const BREATH_MS = 6_000;

/** A negative delay that puts a loop started now in phase with the page clock (a live mark). */
export const breathDelay = () => `-${Math.round(performance.now() % BREATH_MS)}ms`;

/** `{ animationDelay }` for a breathing element, set after mount (the server has no clock), and
    only while it is `active` (a still mark needs no phase; it gets one as it starts). */
export function useBreathPhase(active = true): React.CSSProperties | undefined {
  const [delay, setDelay] = useState<string>();
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => setDelay(breathDelay()));
    return () => cancelAnimationFrame(id);
  }, [active]);
  return active && delay ? { animationDelay: delay } : undefined;
}

const BREATHING = "data-breathing";

/** Ms until the page clock's next breathing peak that is at least `lead` ms away. */
export function untilPeak(lead = 0): number {
  let wait = (BREATH_MS * 1.5 - (performance.now() % BREATH_MS)) % BREATH_MS;
  while (wait < lead) wait += BREATH_MS;
  return wait;
}

/** Start the assistant's loops (CSS, keyed on `data-breathing` on the frame): a swell of `swell` ms
    from rest to the next peak, then the loop from there. */
export function startBreath(frame: HTMLElement, swell: number): void {
  frame.style.setProperty("--breath-period", `${BREATH_MS}ms`);
  frame.style.setProperty("--breath-in", `${Math.round(swell)}ms`);
  frame.setAttribute(BREATHING, "");
}

/** Stop the loops cleanly: each [data-breath] element keeps the value its loop has right now,
    then eases back to rest over `seconds` (0: at once, for reduced motion). data-breath="scale"
    elements breathe their transform, "glow" ones their opacity; only that property is held, so
    the transition's own tweens on the same elements are left alone. */
export function stopBreath(frame: HTMLElement, seconds: number): void {
  if (!frame.hasAttribute(BREATHING)) return;
  const held = [...frame.querySelectorAll<HTMLElement>("[data-breath]")].map((el) => {
    const style = getComputedStyle(el);
    return { el, kind: el.dataset.breath, transform: style.transform, opacity: style.opacity };
  });
  frame.removeAttribute(BREATHING);
  for (const { el, kind, transform, opacity } of held) {
    gsap.killTweensOf(el, kind === "scale" ? "scale,transform" : "opacity");
    if (kind === "scale") {
      const scale = transform && transform !== "none" ? new DOMMatrixReadOnly(transform).a : 1;
      if (seconds > 0) gsap.fromTo(el, { scale }, { scale: 1, duration: seconds, ease: "power2.out", clearProps: "transform" });
      else gsap.set(el, { clearProps: "transform" });
    } else if (kind === "glow") {
      if (seconds > 0) {
        const rest = Number(getComputedStyle(el).opacity); // the loop is off now: its resting value
        gsap.fromTo(el, { opacity: Number(opacity) }, { opacity: rest, duration: seconds, ease: "power2.out", clearProps: "opacity" });
      } else gsap.set(el, { clearProps: "opacity" });
    }
  }
}
