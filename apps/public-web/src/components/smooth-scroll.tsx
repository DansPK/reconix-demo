"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Landing sections jump and fade in; anything else (docs "On this page" headings) keeps the glide. */
const FADE_TARGET = "main > section";

/** For a plain left click on a same-page hash link (`/#workflow` while on `/`), return its target. */
function sameDocumentHashTarget(e: MouseEvent): HTMLElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const anchor = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return null;
  try {
    return document.querySelector<HTMLElement>(url.hash);
  } catch {
    return null;
  }
}

/**
 * Site-wide smooth scrolling. Lenis runs on native scroll (so `position: sticky`
 * keeps working), is stepped by the GSAP ticker and pushes every frame into
 * ScrollTrigger. Renders nothing and is not created under prefers-reduced-motion.
 *
 * Same-page hash links have exactly one owner: a capture-phase click listener
 * updates the URL and moves to the target with Lenis. Landing sections jump
 * there instantly and fade in; other targets (docs "On this page") glide.
 * `preventDefault` makes Next's <Link> bail, so it does not also jump there with scrollIntoView.
 * Cross-page hash links (`/docs` → `/#workflow`) still navigate normally.
 *
 * This is the one client file that uses `useEffect` instead of `useGSAP`:
 * the Lenis instance is not a GSAP object, and the one tween (the section fade) is reverted by hand.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      autoRaf: false, // driven by gsap.ticker below
      lerp: 0.1, // 0.08–0.15; higher = snappier
      smoothWheel: true,
      syncTouch: false, // keep touch native; mobile momentum is already smooth
      stopInertiaOnNavigate: true, // drop momentum when a link to another route is clicked
    });

    let fade: gsap.core.Tween | undefined;
    const onAnchorClick = (e: MouseEvent) => {
      const target = sameDocumentHashTarget(e);
      if (!target) return;
      e.preventDefault();
      history.pushState(null, "", `#${target.id}`);
      if (!target.matches(FADE_TARGET)) {
        lenis.scrollTo(target); // honours the target's scroll-margin-top (scroll-mt-20 under the sticky nav)
        return;
      }
      // Jump (still honouring scroll-margin-top), then fade the section in; fromTo hides it before the next paint.
      const from = lenis.scroll;
      lenis.scrollTo(target, { immediate: true });
      if (Math.abs(lenis.scroll - from) < 1) return; // already there: don't blink it
      // Fade the children, not the section, so the hero's opaque surface keeps covering the ambient glow.
      fade = gsap.fromTo(
        target.children,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", overwrite: true, clearProps: "opacity,transform" }
      );
    };
    window.addEventListener("click", onAnchorClick, true);

    lenis.on("scroll", () => ScrollTrigger.update());
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();

    return () => {
      window.removeEventListener("click", onAnchorClick, true);
      fade?.revert(); // drop a fade that is still running, with its inline styles
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // GSAP default; keeps StrictMode double-mount tidy
      lenis.destroy(); // removes window listeners and the html classes
    };
  }, []);

  return null;
}
