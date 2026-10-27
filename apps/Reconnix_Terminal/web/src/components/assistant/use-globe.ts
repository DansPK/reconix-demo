"use client";

/* The one globe, shared. The dashboard's <Globe /> creates it (a carrier element holding the
   WebGL canvas) in the Overview's hero and publishes it here; the assistant stage carries that
   same element into its own layer while the assistant is open and hands it back when it closes.
   There is never a second globe or a second WebGL context.

   The stage's wishes (paused because it faded out, ambient quality) are kept here too, so they
   apply even when three.js finishes loading after the stage asked. They belong to that globe:
   when it goes away (another page, a remount) they are dropped, so the next one starts drawing
   at full quality. */
import { useSyncExternalStore } from "react";
import { Holds } from "@/lib/globe-holds";
import type { GlobeControls } from "@/lib/globe";

export interface SharedGlobe {
  carrier: HTMLElement; // what moves between the hero and the assistant stage
  home: HTMLElement; // its place in the hero (.dash-globe-wrap)
  controls: GlobeControls | null; // null until three.js has loaded (or without WebGL)
}

let current: SharedGlobe | null = null;
const listeners = new Set<() => void>();
const holds = new Holds();
let ambient = false;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Called by <Globe />: when it mounts, when its controls are ready (a new object), and with
    null when it unmounts (which drops the stage's wishes with it). */
export function publishGlobe(globe: SharedGlobe | null): void {
  current = globe;
  if (!globe) {
    holds.clear();
    ambient = false;
  } else if (globe.controls) {
    for (const reason of holds.list()) globe.controls.pause(reason);
    globe.controls.setAmbient(ambient);
  }
  for (const listener of listeners) listener();
}

export const sharedGlobe = (): SharedGlobe | null => current;

/** The shared globe, re-rendering when it mounts, gets its controls or goes away. */
export function useSharedGlobe(): SharedGlobe | null {
  return useSyncExternalStore(subscribe, sharedGlobe, () => null);
}

/** Pause (on) or release (off) the globe's drawing for `reason`. */
export function holdGlobe(reason: string, on: boolean): void {
  if (!holds.set(reason, on)) return; // no change
  const controls = current?.controls;
  if (controls) {
    if (on) controls.pause(reason);
    else controls.resume(reason);
  }
}

/** Ambient quality while it sits behind the assistant (no bloom, ~30 fps; a still frame on a
    low-power device). */
export function setGlobeAmbient(on: boolean): void {
  ambient = on;
  current?.controls?.setAmbient(on);
}

/** What the stage has asked for (tests and debugging). */
export const globeWishes = () => ({ holds: holds.list(), ambient });
