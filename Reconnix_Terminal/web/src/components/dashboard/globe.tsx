"use client";

import { useEffect, useRef } from "react";
import { publishGlobe, sharedGlobe, type SharedGlobe } from "@/components/assistant/use-globe";
import type { GlobeControls } from "@/lib/globe";

/**
 * The hero globe (§6.2): the page's one three.js globe. three is dynamically imported inside the
 * effect so it stays out of the first JS chunk. Drawing pauses when the canvas is >200px off
 * screen or the tab is hidden (and when the assistant fades it out, use-globe.ts).
 *
 * React renders only the wrap and a CSS glow. The canvas lives in a carrier element made here, so
 * the AI Assistant can carry it out of the hero into its own background and back (the shared
 * element of the open/close animation) while React never loses track of a node it owns. The
 * canvas is transparent until the globe draws, so the glow shows through while three/the data
 * load (no empty hole); on ready the glow fades out. If WebGL is unavailable the glow stays.
 */
export function Globe() {
  const homeRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const home = homeRef.current;
    if (!home) return;
    const carrier = document.createElement("div");
    carrier.className = "dash-globe-carrier";
    carrier.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("canvas");
    canvas.className = "dash-globe-canvas";
    carrier.append(canvas);
    home.append(carrier);
    const shared: SharedGlobe = { carrier, home, controls: null };
    publishGlobe(shared);

    let controls: GlobeControls | null = null;
    let cancelled = false;
    let offscreen = false; // the observer's last word, for controls that arrive later
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4 || (coarse && window.innerWidth < 768);

    const onReady = () => {
      if (!cancelled && glowRef.current) glowRef.current.style.opacity = "0";
    };

    import("@/lib/globe")
      .then(({ mountGlobe }) => {
        if (cancelled) return;
        try {
          controls = mountGlobe(canvas, { reducedMotion: reduce, lowPower, onReady });
        } catch {
          return; // WebGL unavailable: leave the CSS glow in place.
        }
        if (offscreen) controls.pause("offscreen");
        if (document.hidden) controls.pause("hidden");
        if (sharedGlobe()?.carrier === carrier) publishGlobe({ ...shared, controls });
      })
      .catch(() => {});

    const io = new IntersectionObserver(
      ([entry]) => {
        offscreen = !entry.isIntersecting;
        if (offscreen) controls?.pause("offscreen");
        else controls?.resume("offscreen");
      },
      { rootMargin: "200px" },
    );
    io.observe(canvas);
    const onVis = () => {
      if (document.hidden) controls?.pause("hidden");
      else controls?.resume("hidden");
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      controls?.destroy();
      carrier.remove(); // wherever it is (the hero or the assistant stage)
      if (sharedGlobe()?.carrier === carrier) publishGlobe(null);
    };
  }, []);

  return (
    <div ref={homeRef} className="dash-globe-wrap" aria-hidden>
      <div ref={glowRef} className="dash-globe-glow" />
    </div>
  );
}
