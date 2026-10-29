/* The shared globe inside the assistant (the shared element of the transition): carrying its
   carrier out of the hero into the stage's globe layer, where it sits there (the welcome's
   [data-globe-slot], or the stage's centre until the welcome has one), and back home.

   While it travels, the carrier keeps its hero size and moves with a transform (translate +
   scale), so three.js never resizes mid-flight; its dots keep their apparent size meanwhile
   (matchPoints). Once it sits behind the welcome it is laid out at its spot's own size (seated),
   drawn at the resolution it is shown, so it is crisp however small the hero was. */
import { gsap } from "gsap";
import { boxIn, MOTION, type Box, type GlobeAim } from "./motion";
import type { SharedGlobe } from "./use-globe";

/** Where the globe's centre goes and how tall it is, in stage coordinates. */
export interface Spot {
  cx: number;
  cy: number;
  size: number;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/** Behind the welcome: the slot B's welcome leaves for it, else the middle of the stage. */
export function globeSpot(stage: HTMLElement, front: HTMLElement): Spot {
  const slot = front.querySelector<HTMLElement>("[data-globe-slot]");
  const box = slot ? boxIn(slot, stage) : null;
  if (slot && box) {
    // measured without the rise its piece may still carry while the pieces come in
    const piece = slot.closest<HTMLElement>("[data-assistant-piece]");
    const rise = piece ? Number(gsap.getProperty(piece, "y")) || 0 : 0;
    return { cx: box.left + box.width / 2, cy: box.top + box.height / 2 - rise, size: Math.min(box.width, box.height) * MOTION.globeFit };
  }
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  return { cx: w / 2, cy: h / 2, size: Math.min(w, h) * MOTION.globeCentered };
}

/** A square of the spot's size around its centre. */
export const spotBox = (s: Spot): Box => ({ left: s.cx - s.size / 2, top: s.cy - s.size / 2, width: s.size, height: s.size });

/** The spot for a box (the hero's globe box, on the way home). */
export const boxSpot = (b: Box): Spot => ({ cx: b.left + b.width / 2, cy: b.top + b.height / 2, size: b.height });

export const isCarried = (g: SharedGlobe | null, layer: HTMLElement | null): boolean =>
  g !== null && layer !== null && g.carrier.parentElement === layer;

/** The carrier's own box in the layer (offset*: transforms don't count). */
const layoutBox = (c: HTMLElement): Box => ({ left: c.offsetLeft, top: c.offsetTop, width: c.offsetWidth, height: c.offsetHeight });

/** The transform that puts a carrier laid out at `box` on `spot`, ending at `opacity`. */
export function aimFrom(carrier: HTMLElement, box: Box, spot: Spot, opacity: number, mask: number = MOTION.globeMask.stage): GlobeAim {
  return {
    carrier,
    x: spot.cx - (box.left + box.width / 2),
    y: spot.cy - (box.top + box.height / 2),
    scale: box.height ? spot.size / box.height : 1,
    opacity,
    mask,
  };
}

/** The same for the carrier where it is laid out now (it is in the stage). */
export const aimAt = (carrier: HTMLElement, spot: Spot, opacity: number, mask?: number): GlobeAim =>
  aimFrom(carrier, layoutBox(carrier), spot, opacity, mask);

/** Move the carrier into `layer`, laid out at `box` (stage coordinates) with no transform and
    its mask at `mask` (%). The caller stops any tween of it first (a timeline may be about to
    move it). */
export function carryGlobe(g: SharedGlobe, layer: HTMLElement, box: Box, opacity: number, mask: number): void {
  const c = g.carrier;
  if (c.parentElement !== layer) layer.append(c);
  Object.assign(c.style, { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) });
  c.style.setProperty("--globe-mask", `${mask}%`);
  gsap.set(c, { x: 0, y: 0, scale: 1, opacity, transformOrigin: "50% 50%" });
  g.controls?.setPointScale(1);
  g.controls?.redraw();
}

/** Back into the hero, exactly as it was there. */
export function homeGlobe(g: SharedGlobe): void {
  const c = g.carrier;
  gsap.killTweensOf(c);
  if (c.parentElement !== g.home) g.home.append(c);
  gsap.set(c, { clearProps: "all" });
  g.controls?.setPointScale(1);
  g.controls?.redraw();
}

const scaleOf = (c: HTMLElement) => Number(gsap.getProperty(c, "scale")) || 1;
const maskOf = (c: HTMLElement) => parseFloat(c.style.getPropertyValue("--globe-mask")) || MOTION.globeMask.stage;

/** The dots and lines at their apparent size while the carrier is shown scaled (call it whenever
    its scale changes). */
export const matchPoints = (g: SharedGlobe) => g.controls?.setPointScale(1 / scaleOf(g.carrier));

/** Seated: laid out at the spot's own size with no transform, so it is drawn at the resolution
    it is shown (from a small hero it was scaled up). Nothing moves; it only sharpens. */
export function seatGlobe(g: SharedGlobe, layer: HTMLElement, spot: Spot): void {
  if (Math.abs(scaleOf(g.carrier) - 1) < 0.03) return; // drawn at its size already
  carryGlobe(g, layer, spotBox(spot), Number(gsap.getProperty(g.carrier, "opacity")), maskOf(g.carrier));
}

/** Where the carrier shows now, in the layer's coordinates (its layout moved by its own transform;
    the breathing layer's scale isn't counted, it applies on top either way). */
function shownSpot(c: HTMLElement): Spot {
  const b = layoutBox(c);
  const p = (k: string) => Number(gsap.getProperty(c, k)) || 0;
  return { cx: b.left + b.width / 2 + p("x"), cy: b.top + b.height / 2 + p("y"), size: b.height * scaleOf(c) };
}

/** Laid out at `box` (the hero's, before a close takes it home) and shown where it is now. */
export function unseatGlobe(g: SharedGlobe, layer: HTMLElement, box: Box): void {
  const now = shownSpot(g.carrier);
  carryGlobe(g, layer, box, Number(gsap.getProperty(g.carrier, "opacity")), maskOf(g.carrier));
  const at = aimFrom(g.carrier, box, now, 1);
  gsap.set(g.carrier, { x: at.x, y: at.y, scale: at.scale });
  matchPoints(g);
}

/** The teal glow behind the globe, and the breathing layer's pivot, on the spot. */
export function placeAround(spot: Spot, halo: HTMLElement, breath: HTMLElement): void {
  const size = spot.size * MOTION.haloSize;
  Object.assign(halo.style, { left: px(spot.cx - size / 2), top: px(spot.cy - size / 2), width: px(size), height: px(size) });
  breath.style.transformOrigin = `${px(spot.cx)} ${px(spot.cy)}`;
}
