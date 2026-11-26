"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { SPLASH_EXIT_EVENT } from "@/components/ui/reconix-splash";

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

let introPlayed = false;

/** What the CSS hides until GSAP reveals it (styles/dashboard.css, "Intro reveal"). */
const REVEAL = ".dash-reveal, .dash-overview .dash-card, .dash-navbtn";

/** The pieces in `node` (itself included) that are still hidden for the intro. */
function hiddenPieces(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const found = node.matches(REVEAL) ? [node] : [];
  found.push(...Array.from(node.querySelectorAll<HTMLElement>(REVEAL)));
  return found.filter((el) => getComputedStyle(el).visibility === "hidden" && !gsap.isTweening(el));
}

/**
 * Pieces that stream in after the intro ran (each view's data arrives behind its own Suspense
 * boundary, seconds after hydration) would stay hidden by the intro CSS: nothing else reveals
 * them. Watch the page and fade each one in as it arrives. Returns the cleanup.
 */
function revealLateArrivals(): () => void {
  const observer = new MutationObserver((records) => {
    const late = records.flatMap((r) => Array.from(r.addedNodes).flatMap(hiddenPieces));
    if (late.length) gsap.fromTo(late, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "expo.out", stagger: 0.04, clearProps: "transform" });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Master intro timeline (§7.1). Runs once after hydration. Under reduced motion (or after the
 * first intro has already played in this tab) it reveals everything immediately so returning to
 * Overview after a route skeleton never flashes a blank second loading state.
 */
export function Intro() {
  useEffect(() => revealLateArrivals(), []);
  useGSAP(() => {
    const reveal = q(".dash-reveal, .dash-overview .dash-card, .dash-navbtn");
    // only the numbers on screen count up: a hidden view (they all stay mounted) keeps its
    // server text, so opening it later never shows a count stuck partway
    const counts = q("[data-countup]").filter((el) => el.getClientRects().length > 0);

    const overview = document.querySelector<HTMLElement>('[data-view-pane="overview"]');
    const assistantOpen = document.querySelector(".dash-frame[data-assistant-open]") !== null;
    const onOverview = Boolean(overview && !overview.hidden && !assistantOpen);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !onOverview || introPlayed) {
      // autoAlpha sets visibility to inherit, not visible: a hidden parent (the top bar under
      // the open assistant) keeps its controls out of reach. Secondary views and subsequent
      // visits reveal immediately without waiting on the Overview's staggered intro.
      if (reveal.length) gsap.set(reveal, { autoAlpha: 1 });
      return;
    }

    const frame = document.querySelector(".dash-frame");
    // the Overview's groups, found as the assistant's transition finds them (data-motion)
    const group = (name: string) => q(`[data-motion="${name}"] .dash-card`);
    const cards = [...group("top"), ...group("right"), ...group("bottom"), ...group("hero")];

    if (reveal.length) gsap.set(reveal, { autoAlpha: 0 });

    const play = () => {
      introPlayed = true;
      const tl = gsap.timeline();
      if (frame) tl.fromTo(frame, { scale: 0.99 }, { scale: 1, duration: 0.55, ease: "expo.out", clearProps: "transform" }, 0);
      const nav = some(q(".dash-navbtn"));
      if (nav) tl.fromTo(nav, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: "expo.out", stagger: 0.03, clearProps: "transform" }, 0);
      const head = some(q("header .dash-reveal"));
      if (head) tl.fromTo(head, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "expo.out", stagger: 0.04, clearProps: "transform" }, 0.04);
      const hero = some(q('[data-motion="hero"] .dash-reveal'));
      if (hero) tl.fromTo(hero, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: "expo.out", stagger: 0.06, clearProps: "transform" }, 0.06);
      if (cards.length)
        tl.fromTo(
          cards,
          { autoAlpha: 0, y: 18, filter: "blur(6px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65, ease: "expo.out", stagger: 0.045, clearProps: "transform,filter" },
          0.1,
        );
      // chart reveals
      const bars = some(q("[data-bar]"));
      if (bars) tl.from(bars, { scaleY: 0, transformOrigin: "center bottom", duration: 0.55, ease: "expo.out", stagger: 0.005, clearProps: "transform" }, 0.35);
      const barsX = some(q("[data-bar-x]"));
      if (barsX) tl.from(barsX, { scaleX: 0, transformOrigin: "left center", duration: 0.7, ease: "expo.out", stagger: 0.025, clearProps: "transform" }, 0.4);

      // count-ups start as the cards come in
      counts.forEach((el, i) => countUp(el, 0.18 + i * 0.025));
    };

    if (document.documentElement.dataset.reconixSplash === "active") {
      window.addEventListener(SPLASH_EXIT_EVENT, play, { once: true });
      return () => window.removeEventListener(SPLASH_EXIT_EVENT, play);
    }
    play();
  });

  return null;
}
