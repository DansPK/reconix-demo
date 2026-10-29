"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { TINTS } from "@/components/section-themes";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Fixed, full-viewport glow behind the landing page. One layer per tint; the
 * layer for the section currently crossing the 55% line fades in and the rest
 * fade out, so the page is neutral over the hero, showcase and footer.
 * Sections opt in with `data-ambient="<tint>"` (SectionShell's `tint` prop).
 */
export function ScrollAmbient() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const layers = gsap.utils.toArray<HTMLElement>("[data-tint]", ref.current);
      // pre-declared: ScrollTrigger.create can fire onToggle synchronously when the page loads mid-section
      const triggers: ScrollTrigger[] = [];

      const apply = () => {
        const active = triggers.find((t) => t.isActive)?.trigger as HTMLElement | undefined;
        const tint = active?.dataset.ambient;
        gsap.to(layers, {
          opacity: (_i: number, el: HTMLElement) => (el.dataset.tint === tint ? 1 : 0),
          duration: reduced ? 0 : 0.9,
          ease: "power2.out",
          overwrite: true,
        });
      };

      // The sections live outside this component. Inside a scoped useGSAP context,
      // gsap.utils.toArray(selector) is scoped to the ref too, so query the document explicitly.
      document.querySelectorAll<HTMLElement>("[data-ambient]").forEach((el) => {
        triggers.push(
          ScrollTrigger.create({ trigger: el, start: "top 55%", end: "bottom 55%", onToggle: apply })
        );
      });
      apply();
    },
    { scope: ref }
  );

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {TINTS.map((t) => (
        <div key={t} data-tint={t} className="ambient-layer" />
      ))}
    </div>
  );
}
