"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Thin bar at the top of the page that fills as the reader scrolls.
 * Rebuilt on every route change so the trigger's end matches the new page height.
 * It stays on under reduced motion: it reports scroll position, it is not decoration.
 */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      gsap.to(ref.current, {
        scaleX: 1,
        ease: "none",
        // `true`, not a number: Lenis already eases the scroll, a lag here would stack on it
        scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: true },
      });
    },
    { scope: ref, dependencies: [pathname], revertOnUpdate: true }
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="fixed left-0 top-0 z-50 h-0.5 w-full origin-left scale-x-0 bg-primary"
    />
  );
}
