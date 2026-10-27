"use client";

/* Where the AI Assistant lives: a stage over the frame beside the sidebar (over the top bar and the
   content area). Its layers, bottom to top:
     surface — the box the open/close animation grows out of the hero and shrinks back into:
               the fill (the stage's background) and the card (the chat panel's frame)
     globe   — the dashboard's own globe, carried here from the hero (use-globe.ts, motion-globe.ts):
               it sits on the card, behind the welcome text, at MOTION.globeOpacity
     front   — the chat (AssistantView), always full size; its pieces fade in as the surface lands
   The transition (motion.ts) and the breathing loops (breath.ts, [data-breath]) never animate the
   same property of the same element, so they never fight. Only the globe layer breathes here (and
   the sidebar's icon): the card and the panel hold the chat's text, and text never moves (the
   owner's rule: a scaled panel makes the letters vibrate while reading).

   It follows the address: when `view` becomes "assistant" it opens, when it leaves it closes, and
   it tells the Viewer which view to show (`setShown`). The dashboard stays on screen while the
   assistant animates in; while it is open the Overview stays laid out underneath with its parts
   hidden and inert, so closing grows straight back into it. Opened from another view, the
   assistant crossfades in over it and closes back to it. A request during a transition kills the
   running timeline and animates on from wherever everything is. The globe's aim, the focus and
   the scroll positions have their own hooks (use-globe-aim, use-return-focus, use-view-scroll). */
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { leaveAssistant, type View } from "@/components/dashboard/view-url";
import { AssistantView } from "./assistant-view";
import { startBreath, stopBreath, untilPeak } from "./breath";
import {
  boxIn,
  clearParts,
  closeTimeline,
  fadeTimeline,
  findParts,
  type GlobeAim,
  type Layers,
  MOTION,
  openTimeline,
  resetLayers,
  setPartsOut,
} from "./motion";
import { type Phase, reducedMotion, roomy } from "./motion-env";
import {
  aimAt,
  aimFrom,
  boxSpot,
  carryGlobe,
  globeSpot,
  homeGlobe,
  isCarried,
  matchPoints,
  placeAround,
  spotBox,
  unseatGlobe,
} from "./motion-globe";
import { AssistantShown } from "./use-assistant-shown";
import { holdGlobe, setGlobeAmbient, sharedGlobe } from "./use-globe";
import { useGlobeAim } from "./use-globe-aim";
import { useReturnFocus } from "./use-return-focus";
import { useViewScroll } from "./use-view-scroll";

export function AssistantStage({ view, shown, setShown }: { view: View; shown: View; setShown: (v: View) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const globeLayer = useRef<HTMLDivElement>(null);
  const globeBreath = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const timeline = useRef<gsap.core.Timeline | null>(null);
  const phase = useRef<Phase>(view === "assistant" ? "open" : "closed");
  const closingTo = useRef<View | null>(null);
  const shownNow = useRef(shown);
  const partsOut = useRef(false); // the dashboard's parts carry the open's styles
  const growPending = useRef(false); // close: show the Overview first, then shrink onto it
  const [on, setOn] = useState(view === "assistant");

  const globe = useGlobeAim({ stage, front, halo, breath: globeBreath }, phase, on);
  const focus = useReturnFocus(stage);
  const scroll = useViewScroll(stage);

  // --- lookups ---------------------------------------------------------------------------
  const frame = () => stage.current?.closest<HTMLElement>(".dash-frame") ?? null;
  const layers = (): Layers | null => {
    const [s, f, c, g, h, fr] = [surface.current, fill.current, card.current, globeLayer.current, halo.current, front.current];
    if (!s || !f || !c || !g || !h || !fr) return null;
    const pieces = [...fr.querySelectorAll<HTMLElement>("[data-assistant-piece]")];
    return { surface: s, fill: f, card: c, globe: g, halo: h, front: fr, pieces };
  };
  const stageBox = () => ({ left: 0, top: 0, width: stage.current?.clientWidth ?? 0, height: stage.current?.clientHeight ?? 0 });
  /** Without the fixed-height frame the stage shares the content's grid row, so a view laid out
      under it (while it fades) would stretch it; hold it meanwhile at the height it has once
      settled: the rest of the frame below its top, the frame being a screen tall while the stage
      is on (frame.css), and never less than its own minimum. */
  const lockStage = (hold: boolean) => {
    const s = stage.current;
    const f = frame();
    if (!s) return;
    let h = 0;
    if (hold && !roomy()) {
      const own = parseFloat(getComputedStyle(s).minHeight) || 0;
      const screen = f ? (parseFloat(getComputedStyle(f).minHeight) || 0) - 2 * f.clientTop - s.offsetTop : 0;
      h = Math.max(own, screen);
    }
    if (h > 0) Object.assign(s.style, { height: `${h}px`, alignSelf: "start" });
    else {
      s.style.removeProperty("height");
      s.style.removeProperty("align-self");
    }
  };
  const startBreathing = () => {
    const f = frame();
    if (f) startBreath(f, untilPeak(MOTION.breath.lead));
  };
  /** The open state's pieces, however it got there (an open landing, or a direct address). */
  const enterOpen = () => {
    const f = frame();
    // the Overview stays laid out underneath; its parts wait where a close can grow back from
    if (f && !partsOut.current && roomy() && !reducedMotion()) {
      setPartsOut(findParts(f));
      partsOut.current = true;
    }
    globe.aim("fade");
    setGlobeAmbient(true);
    startBreathing();
    focus.focusComposer(composer.current);
  };

  // --- open ----------------------------------------------------------------------------------
  const settleOpen = () => {
    timeline.current = null;
    phase.current = "open";
    const l = layers();
    if (!l) return;
    gsap.set(l.surface, { clearProps: "left,top,width,height,borderRadius" }); // CSS: the whole stage
    gsap.set(l.pieces, { clearProps: "transform" });
    setShown("assistant");
    enterOpen();
  };

  /** The globe's way from the hero to its spot, carried into the stage only as it starts to move. */
  const globeOut = (s: HTMLElement, l: Layers, b: HTMLElement): GlobeAim | null => {
    const g = sharedGlobe();
    if (!g) return null;
    const spot = globeSpot(s, l.front);
    placeAround(spot, l.halo, b);
    const onUpdate = () => void matchPoints(g);
    if (isCarried(g, b)) return { ...aimAt(g.carrier, spot, globe.opacity()), onUpdate };
    const home = boxIn(g.home, s);
    if (!home) return null;
    const before = () => carryGlobe(g, b, home, 1, MOTION.globeMask.hero);
    return { ...aimFrom(g.carrier, home, spot, globe.opacity()), before, onUpdate };
  };

  /** The crossfade's globe: carried in with the assistant when its hero isn't on screen (else it
      moves once the stage covers the hero, as the open lands). */
  const globeIn = (s: HTMLElement, l: Layers, b: HTMLElement) => {
    const g = sharedGlobe();
    if (!g || globe.opacity() === 0 || boxIn(g.home, s) !== null) return null;
    const spot = globeSpot(s, l.front);
    if (!isCarried(g, b)) carryGlobe(g, b, spotBox(spot), 0, MOTION.globeMask.stage);
    placeAround(spot, l.halo, b);
    const aim = aimAt(g.carrier, spot, globe.opacity());
    gsap.set(g.carrier, { x: aim.x, y: aim.y, scale: aim.scale });
    return { carrier: g.carrier, opacity: aim.opacity };
  };

  const open = (from: View) => {
    const [f, l, s, b] = [frame(), layers(), stage.current, globeBreath.current];
    if (!f || !l || !s || !b) return;
    const interrupted = timeline.current !== null;
    timeline.current?.kill();
    timeline.current = null;
    if (!interrupted) {
      focus.remember();
      scroll.save(from);
    }
    phase.current = "opening";
    closingTo.current = null;
    s.setAttribute("data-on", ""); // now, not on React's next render: the first frame needs it
    setOn(true);
    l.front.style.pointerEvents = "";
    holdGlobe("faded", false);
    const g = sharedGlobe();
    if (g) gsap.killTweensOf([g.carrier, l.halo]); // a fade of the welcome's globe, say

    const parts = findParts(f);
    const to = stageBox();
    const hero = shownNow.current === "overview" ? boxIn(parts.hero, s) : null;
    if (hero && roomy() && !reducedMotion()) {
      partsOut.current = true;
      const aim = globeOut(s, l, b);
      timeline.current = openTimeline({ parts, layers: l, from: hero, to, fresh: !interrupted, globe: aim, onComplete: settleOpen });
      return;
    }
    // crossfade: from another view, on phones and tablets, or with reduced motion
    if (!roomy()) {
      lockStage(true);
      // the page scrolls here: the stage is laid out to fill the screen from the top
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
    }
    const fadeIn = globeIn(s, l, b);
    const reduced = reducedMotion();
    timeline.current = fadeTimeline({ layers: l, show: true, fresh: !interrupted, to, reduced, globe: fadeIn, onComplete: settleOpen });
  };

  // --- close ---------------------------------------------------------------------------------
  const settleClose = () => {
    timeline.current = null;
    phase.current = "closed";
    closingTo.current = null;
    const [f, l, s] = [frame(), layers(), stage.current];
    const g = sharedGlobe();
    if (g) homeGlobe(g);
    setGlobeAmbient(false);
    holdGlobe("faded", false);
    if (f && partsOut.current) clearParts(findParts(f));
    partsOut.current = false;
    if (l) {
      resetLayers(l);
      l.front.style.pointerEvents = "";
    }
    if (globeBreath.current) gsap.set(globeBreath.current, { clearProps: "transform,transformOrigin" });
    lockStage(false);
    s?.removeAttribute("data-on");
    setOn(false);
    focus.restore(f?.querySelector<HTMLElement>('nav [data-view="assistant"]') ?? null);
  };

  /** The crossfade out, over whatever view shows now. */
  const fadeOut = (l: Layers) => {
    timeline.current = fadeTimeline({
      layers: l,
      show: false,
      fresh: false,
      to: stageBox(),
      reduced: reducedMotion(),
      globe: null,
      onComplete: settleClose,
    });
  };

  /** Shrink onto the hero (the Overview is laid out and shown by now). */
  const growBack = () => {
    const [f, l, s, b] = [frame(), layers(), stage.current, globeBreath.current];
    if (!f || !l || !s || !b) return;
    const parts = findParts(f);
    scroll.restore("overview");
    const hero = boxIn(parts.hero, s);
    if (!hero) {
      // nothing to grow back into after all: fade out over it
      if (partsOut.current) clearParts(parts);
      partsOut.current = false;
      fadeOut(l);
      return;
    }
    const g = sharedGlobe();
    let aim: GlobeAim | null = null;
    if (g && isCarried(g, b)) {
      gsap.killTweensOf([g.carrier, l.halo]);
      const home = boxIn(g.home, s);
      // laid out at the hero's size again, back over its place there, then into it (under the
      // hero's cards) as it lands
      if (home) {
        unseatGlobe(g, b, home);
        const travel = { after: () => homeGlobe(g), onUpdate: () => void matchPoints(g) };
        aim = { ...aimAt(g.carrier, boxSpot(home), 1, MOTION.globeMask.hero), ...travel };
      }
    }
    timeline.current = closeTimeline({ parts, layers: l, to: hero, globe: aim, onComplete: settleClose });
  };

  const close = (to: View) => {
    const [f, l, s, b] = [frame(), layers(), stage.current, globeBreath.current];
    if (!f || !l || !s || !b) return;
    const interrupted = timeline.current !== null;
    timeline.current?.kill();
    timeline.current = null;
    stopBreath(f, reducedMotion() ? 0 : MOTION.breath.settle);
    setGlobeAmbient(false);
    holdGlobe("faded", false);
    phase.current = "closing";
    closingTo.current = to;
    l.front.style.pointerEvents = "none"; // the dashboard coming back takes the clicks
    const parts = findParts(f);

    if (to === "overview" && roomy() && !reducedMotion()) {
      // the parts wait where the open left them (unless they are on their way already)
      if (!interrupted || !partsOut.current) setPartsOut(parts);
      partsOut.current = true;
      const laidOut = shownNow.current === "overview" || shownNow.current === "assistant";
      growPending.current = !laidOut; // it was hidden (closing to another view): show it first
      setShown("overview");
      if (laidOut) growBack(); // the Overview is laid out underneath already: measure it now
      return;
    }
    // crossfade back to `to`
    lockStage(true);
    if (partsOut.current) clearParts(parts);
    partsOut.current = false;
    const g = sharedGlobe();
    if (to === "overview" && g && isCarried(g, b)) homeGlobe(g); // its hero shows through the fade
    scroll.restoreWhenShown(to, shownNow.current);
    setShown(to);
    fadeOut(l);
  };

  // --- following the address ---------------------------------------------------------------
  const follow = (v: View) => {
    const p = phase.current;
    if (v === "assistant") {
      if (p === "closed" || p === "closing") open(shownNow.current);
    } else if (p === "open" || p === "opening") close(v);
    else if (p === "closing") {
      if (closingTo.current !== v) close(v); // retarget the close
    } else setShown(v); // an ordinary view switch
  };

  // Handled one frame later, so a Back that lands and a view opened right after it (the sidebar
  // leaving the assistant: back, then replace) count as one change.
  const onView = useEffectEvent((v: View) => follow(v));
  useEffect(() => {
    const id = requestAnimationFrame(() => onView(view));
    return () => cancelAnimationFrame(id);
  }, [view]);

  // after the Viewer has shown what was asked for
  const onShown = useEffectEvent((v: View) => {
    shownNow.current = v;
    if (v === "assistant") lockStage(false); // nothing is laid out under it any more
    scroll.shown(v);
    if (v === "overview" && growPending.current) {
      growPending.current = false;
      growBack();
    }
  });
  useLayoutEffect(() => onShown(shown), [shown]);

  // opened directly (a link, a reload): no box to grow from, just the open state
  const onMount = useEffectEvent(() => {
    if (phase.current === "open") enterOpen();
  });
  useEffect(() => onMount(), []);

  useEffect(
    () => () => {
      timeline.current?.kill();
      holdGlobe("faded", false);
      setGlobeAmbient(false);
    },
    [],
  );

  return (
    <div ref={stage} className="dash-assistant-stage" data-on={on ? "" : undefined} inert={!on} aria-hidden={!on}>
      <div ref={surface} className="dash-assistant-surface" aria-hidden>
        <div ref={fill} className="dash-assistant-fill" />
        <div ref={card} className="dash-assistant-card">
          <div className="dash-assistant-glow" />
        </div>
      </div>
      <div ref={globeLayer} className="dash-assistant-globe" aria-hidden>
        <div ref={globeBreath} className="dash-assistant-globe-breath" data-breath="scale">
          <div ref={halo} className="dash-assistant-halo">
            <div className="dash-assistant-halo-glow" data-breath="glow" />
          </div>
          {/* the dashboard's globe is carried in here while the assistant is open */}
        </div>
      </div>
      <div ref={front} className="dash-assistant-front">
        <div className="dash-assistant-panel">
          <AssistantShown value={on && view === "assistant"}>
            <AssistantView ref={composer} onMinimize={() => leaveAssistant()} />
          </AssistantShown>
        </div>
      </div>
    </div>
  );
}
