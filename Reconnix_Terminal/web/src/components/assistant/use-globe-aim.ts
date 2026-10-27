"use client";

/* The carried globe while the assistant is open: where it sits (the welcome's [data-globe-slot],
   else the stage's centre) and how visible it is (MOTION.globeOpacity on the welcome; 0 once the
   conversation has started, and then it stops drawing). It follows the slot while the stage
   resizes or the conversation scrolls, and fades out or back in as the conversation starts or is
   cleared (New chat). */
import { type RefObject, useEffect, useEffectEvent, useRef } from "react";
import { gsap } from "gsap";
import { useAssistant } from "./assistant-provider";
import { MOTION } from "./motion";
import { type Phase, reducedMotion } from "./motion-env";
import { aimAt, carryGlobe, globeSpot, isCarried, matchPoints, placeAround, seatGlobe, spotBox } from "./motion-globe";
import { holdGlobe, sharedGlobe, useSharedGlobe } from "./use-globe";

type Ref = RefObject<HTMLDivElement | null>;

export interface GlobeAimRefs {
  stage: Ref;
  front: Ref; // the chat (where the slot is)
  halo: Ref; // the teal glow behind the globe
  breath: Ref; // the layer the globe is carried into (it breathes)
}

export function useGlobeAim({ stage, front, halo, breath }: GlobeAimRefs, phase: RefObject<Phase>, on: boolean) {
  const { messages, opening } = useAssistant();
  // the welcome (and its globe): no messages, and no saved conversation being read either, so a
  // reload or a History pick never flashes the globe before its messages arrive
  const welcome = messages.length === 0 && !opening;
  const welcomeNow = useRef(welcome);
  const globe = useSharedGlobe();

  /** How visible the globe should be now. */
  const opacity = () => (welcomeNow.current ? MOTION.globeOpacity : 0);

  /** Put the globe where the open assistant wants it: on its spot (carried in if it is still at
      home), at `opacity()`. "follow" only moves it (resize, scroll); "fade" also fades it in or
      out (the conversation started, New chat, the open just landed). */
  const aim = (how: "follow" | "fade") => {
    const g = sharedGlobe();
    const [s, fr, h, b] = [stage.current, front.current, halo.current, breath.current];
    if (!g || !s || !fr || !h || !b) return;
    const target = opacity();
    const carried = isCarried(g, b);
    // its breathing loop (motion.css) runs only while it can be seen: data-idle stops it at 0
    if (target > 0) delete b.dataset.idle;
    if (!carried && target === 0) {
      b.dataset.idle = "";
      holdGlobe("faded", true); // a conversation and it never came in: it stays home, not drawing
      return;
    }
    const spot = globeSpot(s, fr);
    if (!carried) {
      gsap.killTweensOf(g.carrier);
      carryGlobe(g, b, spotBox(spot), 0, MOTION.globeMask.stage);
    }
    const visible = Number(gsap.getProperty(g.carrier, "opacity")) > 0.01;
    if (how === "follow" || target > 0 || !visible) {
      const to = aimAt(g.carrier, spot, target);
      placeAround(spot, h, b);
      const move = { x: to.x, y: to.y, scale: to.scale };
      const now = (k: string) => Number(gsap.getProperty(g.carrier, k));
      const away = Math.abs(now("x") - to.x) + Math.abs(now("y") - to.y) > 1 || Math.abs(now("scale") - to.scale) > 0.005;
      // once it shows on its spot, it is drawn at the size it is shown (seatGlobe): crisp
      const seat = () => (how === "fade" && target > 0 ? seatGlobe(g, b, spot) : undefined);
      if (how === "fade" && visible && away && !reducedMotion()) {
        const shift = { duration: MOTION.globeShift, ease: "power2.out", overwrite: "auto" as const };
        gsap.to(g.carrier, { ...move, ...shift, onUpdate: () => void matchPoints(g), onComplete: seat });
      } else {
        gsap.set(g.carrier, move);
        matchPoints(g);
        seat();
      }
    }
    if (how === "follow") return;
    const duration = reducedMotion() ? MOTION.fadeReduced.duration : MOTION.globeFade;
    if (target > 0) holdGlobe("faded", false);
    const fade = { duration, ease: "power2.inOut", overwrite: "auto" as const };
    gsap.to(g.carrier, {
      opacity: target,
      ...fade,
      onComplete: () => {
        holdGlobe("faded", target === 0);
        if (target === 0) b.dataset.idle = "";
      },
    });
    gsap.to(h, { opacity: target > 0 ? 1 : 0, ...fade });
  };

  // the globe mounted (or loaded) after the assistant opened
  const onGlobe = useEffectEvent(() => {
    if (phase.current === "open") aim("fade");
  });
  useEffect(() => {
    if (globe) onGlobe();
  }, [globe]);

  // the conversation started (it fades out and stops drawing) or was cleared (back in)
  const onWelcome = useEffectEvent((w: boolean) => {
    welcomeNow.current = w;
    if (phase.current === "open") aim("fade");
  });
  useEffect(() => onWelcome(welcome), [welcome]);

  // while the welcome shows, it follows its slot (resizes, scrolling)
  const onFollow = useEffectEvent(() => {
    if (phase.current === "open" && welcomeNow.current) aim("follow");
  });
  useEffect(() => {
    const [s, fr] = [stage.current, front.current];
    if (!on || !welcome || !s || !fr) return;
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => onFollow());
    };
    const ro = new ResizeObserver(later);
    ro.observe(s);
    const slot = fr.querySelector("[data-globe-slot]");
    if (slot) ro.observe(slot);
    fr.addEventListener("scroll", later, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      fr.removeEventListener("scroll", later, { capture: true });
    };
  }, [on, welcome, stage, front]);

  return { aim, opacity };
}
