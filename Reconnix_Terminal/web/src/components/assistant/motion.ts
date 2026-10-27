/* The dashboard ↔ assistant transition, as GSAP timelines (the intro uses GSAP too).

   Open (≈1.6 s, plan §3): the hero text fades, the top bar goes up, the summary strip up, the
   right column right, the bottom row down (all fading), while the surface grows from the hero's
   box (globe + Ask bar) to the whole stage beside the sidebar and the globe is carried from the
   hero to sit behind the welcome; the assistant's pieces then fade in and rise. Close (≈1.4 s) is
   the same in reverse. The phases overlap, so the motion is continuous rather than delayed.

   Every tween goes *to* a value, so a timeline started mid-way (a click during a transition)
   carries on from wherever things are. Every value lives in MOTION; adjust the feel there. */
import { gsap } from "gsap";

const LEAVE = "power2.inOut"; // parts leaving
const ARRIVE = "power2.out"; // parts arriving
// the surface and the globe: the expo family's shape (a slow start, a long settle) with a lower
// peak speed than expo.inOut itself (≈18 px a frame instead of ≈32 on the right edge at 1920)
const GROW = "power4.inOut";

/** The globe's opacity behind the assistant's welcome: 18 %, kept within 10–30 % so the text over
    it stays readable (plan v3 §3.8: a constant, no settings screen). */
export const GLOBE_OPACITY = 0.18;
export const GLOBE_OPACITY_RANGE = { min: 0.1, max: 0.3 } as const;

/** `value` held within GLOBE_OPACITY_RANGE (a NaN falls back to GLOBE_OPACITY). */
export function clampGlobeOpacity(value: number): number {
  if (Number.isNaN(value)) return GLOBE_OPACITY;
  return Math.min(GLOBE_OPACITY_RANGE.max, Math.max(GLOBE_OPACITY_RANGE.min, value));
}

export const MOTION = {
  // ---- open: seconds from the click ----
  open: {
    heroFade: { at: 0, duration: 0.3 }, // the hero title and the Ask bar fade where they are
    topbar: { at: 0, duration: 0.85 }, // up by its own height
    top: { at: 0.06, duration: 0.85, travel: 48 }, // the summary strip, up
    right: { at: 0.12, duration: 0.85, travel: 140 }, // Findings by Severity
    bottom: { at: 0.18, duration: 0.85, travel: 140 }, // the timelines
    leave: LEAVE,
    surface: { at: 0.15, duration: 1.3, ease: GROW }, // hero box → the stage (ends 1.45)
    fill: { at: 0.25, duration: 0.8 }, // the stage background comes in (to MOTION.fillOpacity)
    card: { at: 0.3, duration: 0.85 }, // the chat panel's frame
    // hero → behind the welcome; it leaves the hero once the hero's glass cards have faded
    // (heroFade), so lifting it above them into the stage never shows (ends 1.45)
    globe: { at: 0.3, duration: 1.15, ease: GROW },
    halo: { at: 0.6, duration: 0.85 }, // its teal glow
    pieces: { at: 1.05, duration: 0.41, stagger: 0.07, rise: 12, ease: ARRIVE }, // ends 1.6
  },
  // ---- close: the reverse, ≈1.4 s ----
  close: {
    pieces: { at: 0, duration: 0.26, stagger: 0.04, sink: 8, ease: LEAVE },
    surface: { at: 0.08, duration: 0.92, ease: GROW }, // back onto the hero box (ends 1.0)
    card: { at: 0.28, duration: 0.62 },
    fill: { at: 0.35, duration: 0.63 }, // gone by 0.98, before the globe drops back under it
    globe: { at: 0.08, duration: 0.92, ease: GROW }, // home by 1.0, before the hero text returns
    halo: { at: 0, duration: 0.45 },
    bottom: { at: 0.4, duration: 0.85 },
    right: { at: 0.45, duration: 0.85 },
    top: { at: 0.5, duration: 0.85 },
    topbar: { at: 0.55, duration: 0.85 }, // ends 1.4
    heroFade: { at: 1.02, duration: 0.38 },
    arrive: ARRIVE,
  },
  radius: 16, // the surface's corners while it is the hero's size (0 when it fills the stage)
  fillOpacity: 1, // the stage background once the assistant is open, however it opened
  // ---- the globe behind the assistant ----
  globeOpacity: clampGlobeOpacity(GLOBE_OPACITY), // on the welcome screen
  globeFit: 1, // its height as a share of the welcome's globe slot (the slot's smaller side)
  globeCentered: 0.56, // no slot: its height as a share of the stage's smaller side, centred
  globeFade: 0.6, // fading out when the conversation starts, back on New chat
  globeShift: 0.35, // s: moving to a new spot while it shows (the welcome reflowed)
  haloSize: 1.5, // its teal halo, as a share of the globe's height
  // its round mask in the stage (motion.css), in % of the canvas's half height: none at the
  // hero, closing in as it travels, so the canvas's edges never show over the chat
  globeMask: { hero: 300, stage: 100 },
  // ---- plain crossfade (no hero to grow from, phones and tablets, reduced motion) ----
  fade: { duration: 0.3, rise: 8 },
  fadeReduced: { duration: 0.22, rise: 0 },
  // ---- breathing (breath.ts and motion.css; the cycle is BREATH_MS) ----
  // (the loops' ranges are motion.css's keyframes: icon 1 ↔ 1.10, globe 0.98 ↔ 1.02; the chat
  // panel never breathes: it holds text, and text never moves)
  breath: {
    lead: 1500, // ms: the first swell, from rest to the page clock's next peak, lasts at least this
    settle: 0.45, // s: back to rest when the assistant closes
  },
} as const;

export type Box = { left: number; top: number; width: number; height: number };

/** `el`'s box relative to `stage`, or null when it isn't laid out (hidden). */
export function boxIn(el: Element | null, stage: HTMLElement): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const s = stage.getBoundingClientRect();
  return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
}

// --- the dashboard's parts ----------------------------------------------------------------

export interface Parts {
  topbar: HTMLElement | null; // the frame's top bar
  top: HTMLElement[]; // the summary strip
  right: HTMLElement[]; // Findings by Severity
  bottom: HTMLElement[]; // the timelines row
  hero: HTMLElement | null; // the globe + Ask bar box the surface grows from
  fade: HTMLElement[]; // the hero's title and the Ask bar: they only fade
}

/** The Overview's groups by their `data-motion` attribute only (phase 0 contract 2: the
    dashboard marks top, hero, fade, right and bottom), and the top bar: the frame's own <header>
    (TopBar, which the Viewer renders as a child of the frame). */
export function findParts(frame: HTMLElement): Parts {
  const root = frame.querySelector<HTMLElement>('[data-view-pane="overview"]') ?? frame;
  const pick = (motion: string) => [...root.querySelectorAll<HTMLElement>(`[data-motion="${motion}"]`)];
  return {
    topbar: frame.querySelector<HTMLElement>(":scope > header"),
    top: pick("top"),
    right: pick("right"),
    bottom: pick("bottom"),
    hero: pick("hero")[0] ?? null,
    fade: pick("fade"),
  };
}

const moving = (p: Parts) => [p.topbar, ...p.top, ...p.right, ...p.bottom, ...p.fade].filter((e): e is HTMLElement => e !== null);

/** The parts where the open animation leaves them: gone, and out of the way. */
export function setPartsOut(p: Parts): void {
  const o = MOTION.open;
  const out = { overwrite: "auto" as const }; // the intro may still be bringing some in
  if (p.topbar) gsap.set(p.topbar, { yPercent: -100, autoAlpha: 0, ...out });
  if (p.top.length) gsap.set(p.top, { y: -o.top.travel, autoAlpha: 0, ...out });
  if (p.right.length) gsap.set(p.right, { x: o.right.travel, autoAlpha: 0, ...out });
  if (p.bottom.length) gsap.set(p.bottom, { y: o.bottom.travel, autoAlpha: 0, ...out });
  if (p.fade.length) gsap.set(p.fade, { autoAlpha: 0, ...out });
}

/** The parts back to their own styles: no inline transform or opacity, and visibility
    "inherit", as the intro leaves them (dashboard.css hides cards until the intro shows them). */
export function clearParts(p: Parts): void {
  const els = moving(p);
  gsap.killTweensOf(els);
  gsap.set(els, { clearProps: "transform,opacity" });
  gsap.set(els, { visibility: "inherit" });
}

// --- the assistant's layers -----------------------------------------------------------------

export interface Layers {
  surface: HTMLElement; // the growing box: fill + card
  fill: HTMLElement;
  card: HTMLElement;
  globe: HTMLElement; // the layer the globe is carried into
  halo: HTMLElement; // the globe's teal glow there
  front: HTMLElement; // the chat itself, always full size
  pieces: HTMLElement[]; // header, conversation, composer ([data-assistant-piece])
}

/** Where the carried globe goes: a transform of its carrier, and how visible it ends up. */
export interface GlobeAim {
  carrier: HTMLElement;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  mask: number; // MOTION.globeMask.*
  before?: () => void; // as it starts moving (carry it into the stage)
  after?: () => void; // once it has landed (hand it back to the hero)
  onUpdate?: () => void; // every frame it moves (keep its dots' apparent size)
}

export const surfaceBox = (b: Box, radius: number) => ({
  left: b.left,
  top: b.top,
  width: b.width,
  height: b.height,
  borderRadius: radius,
});

/** The carried globe's tween to `g` (open or close). */
const globeTo = (g: GlobeAim, t: { duration: number; ease: string }) => ({
  x: g.x,
  y: g.y,
  scale: g.scale,
  opacity: g.opacity,
  "--globe-mask": `${g.mask}%`,
  duration: t.duration,
  ease: t.ease,
  onUpdate: g.onUpdate,
});

/** Open: the dashboard leaves and the surface grows from `from` (the hero's box) to `to`. */
export function openTimeline(o: {
  parts: Parts;
  layers: Layers;
  from: Box;
  to: Box;
  fresh: boolean; // false: carry on from a close that was interrupted
  globe: GlobeAim | null;
  onComplete: () => void;
}): gsap.core.Timeline {
  const m = MOTION.open;
  const { parts: p, layers: l } = o;
  if (o.fresh) {
    gsap.set(l.surface, surfaceBox(o.from, MOTION.radius));
    gsap.set([l.fill, l.card, l.front, l.halo], { opacity: 0 });
    gsap.set(l.pieces, { opacity: 0, y: m.pieces.rise });
  }
  const tl = gsap.timeline({ onComplete: o.onComplete });
  const leave = { ease: m.leave, overwrite: "auto" as const };
  if (p.fade.length) tl.to(p.fade, { autoAlpha: 0, duration: m.heroFade.duration, ...leave }, m.heroFade.at);
  if (p.topbar) tl.to(p.topbar, { yPercent: -100, autoAlpha: 0, duration: m.topbar.duration, ...leave }, m.topbar.at);
  if (p.top.length) tl.to(p.top, { y: -m.top.travel, autoAlpha: 0, duration: m.top.duration, ...leave }, m.top.at);
  if (p.right.length) tl.to(p.right, { x: m.right.travel, autoAlpha: 0, duration: m.right.duration, ...leave }, m.right.at);
  if (p.bottom.length) tl.to(p.bottom, { y: m.bottom.travel, autoAlpha: 0, duration: m.bottom.duration, ...leave }, m.bottom.at);

  tl.to(l.surface, { ...surfaceBox(o.to, 0), duration: m.surface.duration, ease: m.surface.ease }, m.surface.at);
  tl.to(l.fill, { opacity: MOTION.fillOpacity, duration: m.fill.duration, ease: LEAVE }, m.fill.at);
  tl.to(l.card, { opacity: 1, duration: m.card.duration, ease: LEAVE }, m.card.at);
  if (o.globe) {
    const g = o.globe;
    if (g.before) tl.call(g.before, undefined, m.globe.at);
    tl.to(g.carrier, globeTo(g, m.globe), m.globe.at);
    tl.to(l.halo, { opacity: g.opacity > 0 ? 1 : 0, duration: m.halo.duration, ease: LEAVE }, m.halo.at);
  }
  tl.set(l.front, { opacity: 1 }, m.pieces.at);
  tl.to(l.pieces, { opacity: 1, y: 0, duration: m.pieces.duration, stagger: m.pieces.stagger, ease: m.pieces.ease }, m.pieces.at);
  return tl;
}

/** Close: the pieces go, the surface shrinks back to `to` (the hero's box), the globe returns to
    the hero and the dashboard comes back. */
export function closeTimeline(o: {
  parts: Parts;
  layers: Layers;
  to: Box;
  globe: GlobeAim | null;
  onComplete: () => void;
}): gsap.core.Timeline {
  const m = MOTION.close;
  const { parts: p, layers: l } = o;
  const tl = gsap.timeline({ onComplete: o.onComplete });
  const out = { opacity: 0, y: m.pieces.sink, duration: m.pieces.duration, stagger: m.pieces.stagger, ease: m.pieces.ease };
  tl.to([...l.pieces].reverse(), out, m.pieces.at);
  tl.set(l.front, { opacity: 0 }, m.pieces.at + m.pieces.duration + m.pieces.stagger * 2);
  tl.to(l.surface, { ...surfaceBox(o.to, MOTION.radius), duration: m.surface.duration, ease: m.surface.ease }, m.surface.at);
  tl.to(l.card, { opacity: 0, duration: m.card.duration, ease: LEAVE }, m.card.at);
  tl.to(l.fill, { opacity: 0, duration: m.fill.duration, ease: LEAVE }, m.fill.at);
  tl.to(l.halo, { opacity: 0, duration: m.halo.duration, ease: LEAVE }, m.halo.at);
  if (o.globe) {
    const g = o.globe;
    tl.to(g.carrier, globeTo(g, m.globe), m.globe.at);
    if (g.after) tl.call(g.after, undefined, m.globe.at + m.globe.duration);
  }
  const arrive = { ease: m.arrive, overwrite: "auto" as const };
  if (p.bottom.length) tl.to(p.bottom, { y: 0, autoAlpha: 1, duration: m.bottom.duration, ...arrive }, m.bottom.at);
  if (p.right.length) tl.to(p.right, { x: 0, autoAlpha: 1, duration: m.right.duration, ...arrive }, m.right.at);
  if (p.top.length) tl.to(p.top, { y: 0, autoAlpha: 1, duration: m.top.duration, ...arrive }, m.top.at);
  if (p.topbar) tl.to(p.topbar, { yPercent: 0, autoAlpha: 1, duration: m.topbar.duration, ...arrive }, m.topbar.at);
  if (p.fade.length) tl.to(p.fade, { autoAlpha: 1, duration: m.heroFade.duration, ...arrive }, m.heroFade.at);
  return tl;
}

/** The plain crossfade: the surface fills the stage and every layer fades in (or out). */
export function fadeTimeline(o: {
  layers: Layers;
  show: boolean;
  fresh: boolean; // showing from closed (not from an interrupted close)
  to: Box;
  reduced: boolean;
  globe: { carrier: HTMLElement; opacity: number } | null; // carried in with it: fade it in too
  onComplete: () => void;
}): gsap.core.Timeline {
  const { layers: l } = o;
  const f = o.reduced ? MOTION.fadeReduced : MOTION.fade;
  const tl = gsap.timeline({ onComplete: o.onComplete });
  if (o.show) {
    if (o.fresh) {
      gsap.set(l.surface, surfaceBox(o.to, 0));
      gsap.set([l.fill, l.card, l.front, l.halo], { opacity: 0 });
      gsap.set(l.pieces, { opacity: 0, y: f.rise });
    }
    // from wherever an interrupted close left things; the layers come in together
    tl.to(l.surface, { ...surfaceBox(o.to, 0), duration: f.duration, ease: ARRIVE }, 0);
    tl.to(l.fill, { opacity: MOTION.fillOpacity, duration: f.duration, ease: ARRIVE }, 0);
    tl.to([l.card, l.front, l.globe], { opacity: 1, duration: f.duration, ease: ARRIVE }, 0);
    tl.to(l.pieces, { opacity: 1, y: 0, duration: f.duration, ease: ARRIVE }, 0);
    if (o.globe) {
      tl.to(o.globe.carrier, { opacity: o.globe.opacity, duration: f.duration, ease: ARRIVE, overwrite: "auto" }, 0);
      tl.to(l.halo, { opacity: o.globe.opacity > 0 ? 1 : 0, duration: f.duration, ease: ARRIVE }, 0);
    }
  } else {
    tl.to([l.fill, l.card, l.front, l.halo, l.globe], { opacity: 0, duration: f.duration, ease: LEAVE }, 0);
  }
  return tl;
}

/** The layers back to their own styles, ready for the next open. */
export function resetLayers(l: Layers): void {
  const els = [l.surface, l.fill, l.card, l.globe, l.halo, l.front, ...l.pieces];
  gsap.killTweensOf(els);
  gsap.set(els, { clearProps: "left,top,width,height,borderRadius,opacity,transform,visibility" });
}
