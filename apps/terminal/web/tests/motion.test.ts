/* The assistant transition's pure parts: why the globe is paused (lib/globe-holds.ts), the
   stage's wishes for the shared globe and their reset when it goes away (use-globe.ts), the
   breathing's next peak (breath.ts), and where the carried globe goes (motion-globe.ts). */
import { afterEach, describe, expect, it, vi } from "vitest";

import { BREATH_MS, untilPeak } from "@/components/assistant/breath";
import { clampGlobeOpacity, GLOBE_OPACITY, GLOBE_OPACITY_RANGE, MOTION } from "@/components/assistant/motion";
import { aimFrom, boxSpot, globeSpot, spotBox } from "@/components/assistant/motion-globe";
import { globeWishes, holdGlobe, publishGlobe, setGlobeAmbient, type SharedGlobe } from "@/components/assistant/use-globe";
import type { GlobeControls } from "@/lib/globe";
import { Holds } from "@/lib/globe-holds";

describe("Holds", () => {
  it("holds while any reason does, and says when something changed", () => {
    const h = new Holds();
    expect(h.held).toBe(false);
    expect(h.set("offscreen", true)).toBe(true);
    expect(h.set("offscreen", true)).toBe(false); // a reason counts once
    expect(h.set("faded", true)).toBe(true);
    expect(h.list()).toEqual(["offscreen", "faded"]);
    expect(h.set("offscreen", false)).toBe(true);
    expect(h.held).toBe(true); // "faded" still holds it
    expect(h.set("offscreen", false)).toBe(false);
    expect(h.set("faded", false)).toBe(true);
    expect(h.held).toBe(false);
  });

  it("clears every reason at once", () => {
    const h = new Holds();
    h.set("a", true);
    h.set("b", true);
    h.clear();
    expect(h.held).toBe(false);
    expect(h.list()).toEqual([]);
  });
});

/** Controls that record what the stage asked of them. */
function controls() {
  const calls: string[] = [];
  const c: GlobeControls = {
    pause: (r = "external") => void calls.push(`pause ${r}`),
    resume: (r = "external") => void calls.push(`resume ${r}`),
    setAmbient: (on) => void calls.push(`ambient ${on}`),
    setPointScale: () => {},
    redraw: () => void calls.push("redraw"),
    destroy: () => void calls.push("destroy"),
  };
  return { c, calls };
}
const globe = (c: GlobeControls | null) => ({ carrier: {} as HTMLElement, home: {} as HTMLElement, controls: c }) as SharedGlobe;

describe("the shared globe's wishes", () => {
  afterEach(() => publishGlobe(null));

  it("balances holds: each reason pauses once and resumes once", () => {
    const { c, calls } = controls();
    publishGlobe(globe(c));
    calls.length = 0;
    holdGlobe("faded", true);
    holdGlobe("faded", true); // already held: nothing more
    holdGlobe("faded", false);
    holdGlobe("faded", false); // already released: nothing more
    expect(calls).toEqual(["pause faded", "resume faded"]);
    expect(globeWishes().holds).toEqual([]);
  });

  it("applies wishes made before three.js loaded", () => {
    publishGlobe(globe(null));
    holdGlobe("faded", true);
    setGlobeAmbient(true);
    const { c, calls } = controls();
    publishGlobe(globe(c)); // the controls arrive
    expect(calls).toEqual(["pause faded", "ambient true"]);
  });

  it("drops them when the globe goes away, so the next one draws at full quality", () => {
    const first = controls();
    publishGlobe(globe(first.c));
    holdGlobe("faded", true);
    setGlobeAmbient(true);
    publishGlobe(null); // another page: the globe unmounts
    expect(globeWishes()).toEqual({ holds: [], ambient: false });
    const next = controls();
    publishGlobe(globe(next.c)); // back on the dashboard
    expect(next.calls).toEqual(["ambient false"]); // no pause carried over
  });
});

describe("the globe's opacity behind the welcome", () => {
  it("is 18 %, within the readable range", () => {
    expect(GLOBE_OPACITY).toBe(0.18);
    expect(MOTION.globeOpacity).toBe(GLOBE_OPACITY);
    expect(GLOBE_OPACITY_RANGE).toEqual({ min: 0.1, max: 0.3 });
  });

  it("holds any value within 0.10–0.30", () => {
    expect(clampGlobeOpacity(0.18)).toBe(0.18);
    expect(clampGlobeOpacity(0.1)).toBe(0.1);
    expect(clampGlobeOpacity(0.3)).toBe(0.3);
    expect(clampGlobeOpacity(0)).toBe(0.1);
    expect(clampGlobeOpacity(-1)).toBe(0.1);
    expect(clampGlobeOpacity(0.5)).toBe(0.3);
    expect(clampGlobeOpacity(1)).toBe(0.3);
    expect(clampGlobeOpacity(Number.NaN)).toBe(GLOBE_OPACITY);
  });
});

describe("untilPeak", () => {
  afterEach(() => vi.restoreAllMocks());
  const at = (now: number) => vi.spyOn(performance, "now").mockReturnValue(now);

  it("waits for the page clock's next peak, half-way through a cycle", () => {
    at(1000);
    expect(untilPeak()).toBe(BREATH_MS / 2 - 1000);
    at(BREATH_MS / 2);
    expect(untilPeak()).toBe(0);
    at(BREATH_MS + 500);
    expect(untilPeak()).toBe(BREATH_MS / 2 - 500);
  });

  it("skips a peak that is closer than the lead", () => {
    at(2000); // the next peak is 1 s away
    expect(untilPeak(1500)).toBe(BREATH_MS / 2 - 2000 + BREATH_MS);
    at(BREATH_MS / 2); // on a peak: the next one
    expect(untilPeak(MOTION.breath.lead)).toBe(BREATH_MS);
  });
});

describe("where the carried globe goes", () => {
  it("aims a box's centre at a spot, scaled to the spot's height", () => {
    const carrier = {} as HTMLElement;
    const aim = aimFrom(carrier, { left: 0, top: 0, width: 200, height: 100 }, { cx: 300, cy: 200, size: 50 }, 0.18);
    expect(aim).toEqual({ carrier, x: 200, y: 150, scale: 0.5, opacity: 0.18, mask: MOTION.globeMask.stage });
    expect(aimFrom(carrier, { left: 0, top: 0, width: 0, height: 0 }, { cx: 0, cy: 0, size: 10 }, 1).scale).toBe(1);
  });

  it("round-trips a spot and its square box", () => {
    const spot = { cx: 120, cy: 80, size: 40 };
    expect(spotBox(spot)).toEqual({ left: 100, top: 60, width: 40, height: 40 });
    expect(boxSpot(spotBox(spot))).toEqual(spot);
  });

  const stage = { clientWidth: 1000, clientHeight: 600, getBoundingClientRect: () => ({ left: 10, top: 20 }) } as unknown as HTMLElement;

  it("centres it in the stage when the welcome has no slot", () => {
    const front = { querySelector: () => null } as unknown as HTMLElement;
    expect(globeSpot(stage, front)).toEqual({ cx: 500, cy: 300, size: 600 * MOTION.globeCentered });
  });

  it("puts it on the welcome's slot, sized by the slot's smaller side", () => {
    const slot = { getBoundingClientRect: () => ({ left: 110, top: 120, width: 200, height: 100 }), closest: () => null };
    const front = { querySelector: () => slot } as unknown as HTMLElement;
    expect(globeSpot(stage, front)).toEqual({ cx: 200, cy: 150, size: 100 * MOTION.globeFit });
  });
});
