"use client";

import { useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { NodeGraph, type GraphControls } from "@/components/node-graph";
import { showcaseView, SHOWCASE_TAIL } from "@/lib/node-graph";
import { SHOWCASE } from "@/components/showcase-data";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Pinned feature showcase. The outer section is tall; the inner panel sticks
 * for the whole scroll while ScrollTrigger maps progress to the active item.
 * Odd items sit on the right, even on the left. Nothing moves between steps:
 * the two dark shades crossfade, the old text fades out in its own column and
 * the new text wipes in left to right (`.wipe` in globals.css), and the node
 * map's camera and focus glide (node-graph.js).
 */
export function Showcase({ banners }: { banners: React.ReactNode[] }) {
  const ref = useRef<HTMLElement>(null);
  const graph = useRef<GraphControls | null>(null);
  const [active, setActive] = useState(0);
  const [wide, setWide] = useState(false); // true once the camera is pulling back to the whole map
  const n = SHOWCASE.length;
  const hubIds = SHOWCASE.map((s) => s.focus);

  useGSAP(
    () => {
      if (!ref.current) return;
      ScrollTrigger.create({
        trigger: ref.current,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          // the camera is scrubbed by scroll; the text switches at the midpoint between hubs
          const v = showcaseView(self.progress, hubIds, window.innerWidth >= 1024 ? 0.22 : 0);
          graph.current?.setView({ x: v.x, y: v.y, zoom: v.zoom });
          // after the last hub the camera pulls back to the whole map; text and shade clear with it
          ref.current?.style.setProperty("--overview", v.overview.toFixed(3));
          setActive((prev) => (prev === v.index ? prev : v.index));
          setWide(v.overview > 0.35);
        },
      });
    },
    { scope: ref }
  );

  const item = SHOWCASE[active];
  const SHOWCASE_WITH = SHOWCASE.map((s, i) => ({ ...s, banner: banners[i] }));
  const flip = active % 2 === 1; // odd items put the text on the right, so the shade moves right too

  return (
    <section
      id="showcase"
      ref={ref}
      data-showcase
      className="relative border-t border-border"
      style={{ height: `${(n + SHOWCASE_TAIL) * 100}vh` }}
    >
      <div className="sticky top-0 isolate h-screen overflow-hidden">
        {/* same backdrop as the hero (glow over a pixel grid + scanlines), behind the map */}
        <div aria-hidden className="backdrop backdrop-glow" />
        <div aria-hidden className="hero-scan absolute inset-0" />
        {/* graph layer: one map, the camera travels across it */}
        <div className="absolute inset-0" data-graph aria-hidden>
          {/* no focus during the pull-back, so the whole map lights up */}
          <NodeGraph focus={wide ? null : item.focus} onReady={(c) => { graph.current = c; }} />
          {/* shades thin out as the camera pulls back to the whole map (--overview 0..1) */}
          <div className="absolute inset-0" style={{ opacity: "calc(1 - var(--overview, 0) * 0.85)" }}>
            {/* phones: one even shade; lg+: a left and a right shade that crossfade with the step */}
            <div className="absolute inset-0 bg-background/90 lg:hidden" />
            <div
              data-shade="left"
              className={`showcase-fade absolute inset-0 hidden transition-opacity duration-700 motion-reduce:transition-none lg:block ${flip ? "opacity-0" : "opacity-100"}`}
              style={{ "--fade-dir": "90deg" } as CSSProperties}
            />
            <div
              data-shade="right"
              className={`showcase-fade absolute inset-0 hidden transition-opacity duration-700 motion-reduce:transition-none lg:block ${flip ? "opacity-100" : "opacity-0"}`}
              style={{ "--fade-dir": "270deg" } as CSSProperties}
            />
          </div>
        </div>
        {/* text layer: every item keeps its own column (even = left, odd = right) and the same row,
            so steps crossfade in place and the row is always as tall as the tallest item.
            It clears a little ahead of the shade during the final pull-back. */}
        <div
          className="relative mx-auto flex h-full max-w-6xl items-center px-4 sm:px-6"
          style={{ opacity: "calc(1 - min(1, var(--overview, 0) * 1.6))" }}
        >
          <div className="grid w-full lg:grid-cols-2 lg:gap-x-[8%]" data-text>
            {SHOWCASE_WITH.map((s, i) => (
              <div
                key={s.title}
                data-item={i}
                data-state={i === active ? "in" : "out"}
                aria-hidden={i !== active}
                className={`wipe col-start-1 row-start-1 ${i % 2 === 1 ? "lg:col-start-2" : ""} ${i === active ? "" : "pointer-events-none"}`}
              >
                <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">
                  {s.eyebrow}
                </span>
                <div className="mt-6">{s.banner}</div>
                <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{s.title}</h2>
                <p className="mt-4 max-w-lg text-lg leading-relaxed text-foreground/90 sm:text-xl">{s.tagline}</p>
                <ul className="mt-7 max-w-lg space-y-3 text-[15px] leading-snug text-foreground/80 sm:text-base">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      {/* one line tall, so the dash is centred on the first line however the item wraps */}
                      <span aria-hidden className="flex h-[1.375em] shrink-0 items-center">
                        <span className="block h-0.5 w-3.5 rounded-full bg-primary/80" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
