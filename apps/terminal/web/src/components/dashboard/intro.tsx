"use client";

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const q = (s: string) => Array.from(document.querySelectorAll<HTMLElement>(s));

/** Its targets, or null when there are none: GSAP warns "GSAP target not found" for an empty
    list (a run without chart bars has no [data-bar], the docs have no Overview cards). */
const some = (els: HTMLElement[]): HTMLElement[] | null => (els.length ? els : null);

// Count a number element up from 0 to its (already-correct) server text, keeping its format.
function countUp(el: HTMLElement, delay: number) {
  const fmt = el.dataset.countFormat ?? "int";
  // Stash the final value once: the effect can run twice (Strict Mode), and reading textContent
  // after the first run already reset it to 0 would lose the target.
  if (el.dataset.final === undefined) el.dataset.final = el.textContent ?? "";
  const finalText = el.dataset.final;
  if (fmt === "duration") {
    const m = Number(finalText.match(/(\d+)m/)?.[1] ?? 0);
    const s = Number(finalText.match(/(\d+)s/)?.[1] ?? 0);
    const total = m * 60 + s;
    const o = { v: 0 };
    el.textContent = "0m 00s";
    gsap.to(o, {
      v: total,
      duration: 1.2,
      delay,
      ease: "power2.out",
      onUpdate: () => (el.textContent = `${Math.floor(o.v / 60)}m ${String(Math.floor(o.v % 60)).padStart(2, "0")}s`),
    });
    return;
  }
  const target = parseFloat(finalText.replace(/[^0-9.]/g, "")) || 0;
  const pct = fmt === "pct" ? "%" : "";
  const isInt = !finalText.includes(".");
  const o = { v: 0 };
  el.textContent = isInt ? `0${pct}` : "0.0";
  gsap.to(o, {
    v: target,
    duration: 1.2,
    delay,
    ease: "power2.out",
    onUpdate: () => (el.textContent = `${isInt ? Math.round(o.v) : o.v.toFixed(1)}${pct}`),
  });
}

/**
 * Master intro timeline (§7.1). Runs once after hydration. Under reduced motion it reveals
 * everything at once and leaves the (already-correct) numbers. Server HTML is correct without
 * JS; the hidden-before-animate state is CSS gated on `.js`, which GSAP overrides with inline
 * visibility it never clears.
 */
export function Intro() {
  useGSAP(() => {
    const reveal = q(".dash-reveal, .dash-overview .dash-card, .dash-navbtn");
    // only the numbers on screen count up: a hidden view (they all stay mounted) keeps its
    // server text, so opening it later never shows a count stuck partway
    const counts = q("[data-countup]").filter((el) => el.getClientRects().length > 0);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // autoAlpha sets visibility to inherit, not visible: a hidden parent (the top bar under
      // the open assistant) keeps its controls out of reach
      if (reveal.length) gsap.set(reveal, { autoAlpha: 1 });
      return;
    }

    const frame = document.querySelector(".dash-frame");
    // the Overview's groups, found as the assistant's transition finds them (data-motion)
    const group = (name: string) => q(`[data-motion="${name}"] .dash-card`);
    const cards = [...group("top"), ...group("right"), ...group("bottom"), ...group("hero")];

    if (reveal.length) gsap.set(reveal, { autoAlpha: 0 });

    const tl = gsap.timeline();
    if (frame) tl.fromTo(frame, { scale: 0.985 }, { scale: 1, duration: 0.8, ease: "expo.out", clearProps: "transform" }, 0);
    const nav = some(q(".dash-navbtn"));
    if (nav) tl.fromTo(nav, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.6, ease: "expo.out", stagger: 0.04, clearProps: "transform" }, 0.1);
    const head = some(q("header .dash-reveal"));
    if (head) tl.fromTo(head, { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.05, clearProps: "transform" }, 0.15);
    const hero = some(q('[data-motion="hero"] .dash-reveal'));
    if (hero) tl.fromTo(hero, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, clearProps: "transform" }, 0.25);
    if (cards.length)
      tl.fromTo(
        cards,
        { autoAlpha: 0, y: 24, filter: "blur(8px)" },
        { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "expo.out", stagger: 0.07, clearProps: "transform,filter" },
        0.45,
      );
    // chart reveals
    const bars = some(q("[data-bar]"));
    if (bars) tl.from(bars, { scaleY: 0, transformOrigin: "center bottom", duration: 0.7, ease: "expo.out", stagger: 0.006, clearProps: "transform" }, 0.9);
    const barsX = some(q("[data-bar-x]"));
    if (barsX) tl.from(barsX, { scaleX: 0, transformOrigin: "left center", duration: 1.0, ease: "expo.out", stagger: 0.03, clearProps: "transform" }, 0.95);

    // count-ups start as the cards come in
    counts.forEach((el, i) => countUp(el, 0.6 + i * 0.03));
  });

  return null;
}
