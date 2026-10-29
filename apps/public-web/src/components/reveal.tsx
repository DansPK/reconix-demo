"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Fades and lifts its children into view as they scroll in.
 * Children are visible by default; the animation only runs when motion is allowed.
 */
export function Reveal({
  children,
  className,
  stagger = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const items = ref.current.querySelectorAll("[data-reveal]");
      gsap.from(items.length ? items : ref.current, {
        y: 28,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger,
        scrollTrigger: { trigger: ref.current, start: "top 88%", once: true },
      });
      // Fonts and images can shift layout after mount; recompute trigger positions.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
