/**
 * The hero globe — a plain three.js module (imports only from three, no React). Mounts on a
 * canvas and returns controls: the renderer, the pointer interaction and the render loop here; the
 * scene's layers in globe-scene.ts, the bloom in globe-post.ts, and why it is paused in
 * globe-holds.ts.
 */
import * as THREE from "three";
import { Holds } from "./globe-holds";
import { bloomComposer } from "./globe-post";
import { BASE_YAW, buildScene, clamp01, expoOut, power2InOut } from "./globe-scene";

export type GlobeControls = {
  /** Stop drawing for `reason`; several reasons can hold it at once ("offscreen", "hidden", the
      assistant's "faded"…). It draws again once every reason is lifted with `resume(reason)`. */
  pause(reason?: string): void;
  resume(reason?: string): void;
  /** Ambient mode, behind the AI Assistant at low opacity: no bloom pass and about 30 frames a
      second, so it stays light on the GPU; on a low-power device it stops on a still frame. */
  setAmbient(on: boolean): void;
  /** Scale its dots and lines (1: as designed), for a canvas shown at another size than it is
      drawn (carried with a CSS scale); a still globe redraws. */
  setPointScale(k: number): void;
  /** Draw one frame now (the still globe under reduced motion, after its canvas moved). */
  redraw(): void;
  destroy(): void;
};

type Opts = { reducedMotion: boolean; lowPower: boolean; onReady?: () => void };

export function mountGlobe(canvas: HTMLCanvasElement, opts: Opts): GlobeControls {
  const { reducedMotion, lowPower } = opts;
  const animated = !reducedMotion;
  const pr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
  const glowMul = lowPower ? 1.3 : 1.0; // raise additive alphas when bloom is skipped

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const g = buildScene(canvas, { animated, pr, glowMul });
  const { scene, camera, tilt, spin, cageSpin, stars, uTime, uReveal, uAtmo, uNodePop, land } = g;
  const { cageGeo, cageDrawCount, arcs, ripples, spawnRipple, disposables } = g;
  let yaw = BASE_YAW - 0.6; // intro starts a little behind rest
  let yawVel = 0;
  let pitchOffset = 0;

  // ---- post-processing (none on low-power devices) ----
  const post = lowPower ? null : bloomComposer(renderer, scene, camera);
  const composer = post?.composer ?? null;
  if (post) disposables.push(...post.disposables);

  let ambient = false; // behind the assistant: no bloom, ~30 fps (setAmbient)
  const render = () => (composer && !ambient ? composer.render() : renderer.render(scene, camera));
  let booted = false; // true once the first frame has been drawn
  let running = false; // the loop is drawing

  // ---- sizing ----
  let w = 1;
  let h = 1;
  const resize = () => {
    // the layout size (clientWidth/Height), not getBoundingClientRect(): the assistant carries the
    // canvas with a CSS transform, and the drawing buffer must keep its own resolution meanwhile
    w = Math.max(1, canvas.clientWidth);
    h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
    arcs.forEach((a) => a.mat.resolution.set(w * pr, h * pr));
    // A resize cleared the canvas: draw it again now, not on the loop's next (maybe skipped)
    // frame, so it never shows blank (and when no loop draws: reduced motion, or paused).
    if (booted) render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- interaction ----
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastDrag = -999;
  const pointer = new THREE.Vector2(0, 0);
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw += dx * 0.005;
    yawVel = dx * 0.005;
    pitchOffset = Math.max(-0.35, Math.min(0.35, pitchOffset + dy * 0.005));
    lastDrag = clock.elapsedTime;
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    canvas.style.cursor = "grab";
    lastDrag = clock.elapsedTime;
  };
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  if (animated) {
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---- loop ----
  const clock = new THREE.Clock();
  let raf = 0;
  const AUTO = 0.035;
  const holds = new Holds(); // why it is paused (it draws when nothing holds it)
  let lastDraw = 0;
  const AMBIENT_FRAME_MS = 1000 / 30;
  // on the canvas for tests and debugging: drawing or not, and at which quality
  const state = (s: "running" | "paused" | "still") => (canvas.dataset.globe = s);
  canvas.dataset.globeMode = "full";

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (ambient && now - lastDraw < AMBIENT_FRAME_MS - 4) return; // ~30 fps behind the assistant
    lastDraw = now;
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    uTime.value = t;

    // intro envelopes
    if (animated) {
      spin.scale.setScalar(0.86 + 0.14 * expoOut(clamp01(t / 1.8)));
      uReveal.value = power2InOut(clamp01((t - 0.2) / 1.6));
      uAtmo.value = clamp01((t - 0.5) / 1.2);
      const cageP = clamp01((t - 0.7) / 1.0);
      if (land.ready) cageGeo.setDrawRange(0, Math.floor(cageDrawCount * cageP));
      uNodePop.value = expoOut(cageP);
      const introYaw = t < 2.2 ? -0.6 * (1 - expoOut(t / 2.2)) : 0;
      // auto-rotate fades back in 2.5s after the last drag, over 1.5s
      const sinceDrag = t - lastDrag;
      const autoFade = clamp01((sinceDrag - 2.5) / 1.5);
      if (!dragging) {
        yawVel *= Math.pow(0.92, (dt * 60) / 1); // inertia
        yaw += yawVel;
        yaw += AUTO * dt * autoFade;
      }
      spin.rotation.y = yaw + introYaw;
      cageSpin.rotation.y = (yaw + introYaw) * 0.85;
      tilt.rotation.x = 0.38 + pitchOffset;
      stars.rotation.y += 0.002 * dt;

      // hover parallax
      camera.position.x += (pointer.x * 0.08 - camera.position.x) * 0.06;
      camera.position.y += (pointer.y * 0.08 - camera.position.y) * 0.06;
      camera.lookAt(0, 0, 0);

      // arcs
      if (t > 1.4) {
        for (const arc of arcs) {
          arc.t += dt;
          const local = arc.t - arc.delay;
          const CYCLE = 1.2 + 0.6 + 0.6 + 1.2; // draw, hold, fade, gap
          const lp = ((local % CYCLE) + CYCLE) % CYCLE;
          if (local < 0) {
            arc.mat.opacity = 0;
            (arc.comet.material as THREE.SpriteMaterial).opacity = 0;
            continue;
          }
          let drawn: number;
          let op: number;
          if (lp < 1.2) {
            drawn = power2InOut(lp / 1.2);
            op = 0.6;
          } else if (lp < 1.8) {
            drawn = 1;
            op = 0.6;
          } else if (lp < 2.4) {
            drawn = 1;
            op = 0.6 * (1 - (lp - 1.8) / 0.6);
          } else {
            drawn = 0;
            op = 0;
          }
          arc.mat.opacity = op;
          const cm = arc.comet.material as THREE.SpriteMaterial;
          if (drawn > 0 && drawn < 1 && op > 0) {
            const idx = Math.min(arc.pts.length - 1, Math.floor(drawn * (arc.pts.length - 1)));
            arc.comet.position.copy(arc.pts[idx]);
            cm.opacity = op * 1.5;
          } else {
            cm.opacity = 0;
          }
          // ripple on arrival
          if (lp >= 1.2 && lp - dt < 1.2) spawnRipple(arc.pts[arc.pts.length - 1]);
        }
      }
      // ripples
      for (const r of ripples) {
        if (!r.active) continue;
        r.t += dt;
        const p = r.t / 1.2;
        if (p >= 1) {
          r.active = false;
          r.mesh.visible = false;
          continue;
        }
        r.mesh.scale.setScalar(0.08 * p);
        r.mat.opacity = (1 - p) * 0.8;
      }
    }

    render();
  };

  const start = () => {
    if (running) return;
    running = true;
    state("running");
    clock.getDelta();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (running) state("paused");
    running = false;
    cancelAnimationFrame(raf);
  };
  // after the first frame, run exactly when nothing holds it (before that, kick() decides)
  const sync = () => {
    if (!animated || !booted) return;
    if (holds.held) stop();
    else start();
  };

  // first paint: wait for land, then onReady + start (or a single frame under reduced motion)
  let readyFired = false;
  const kick = () => {
    if (!land.ready) {
      raf = requestAnimationFrame(kick);
      return;
    }
    if (!readyFired) {
      readyFired = true;
      opts.onReady?.();
    }
    booted = true;
    if (animated) {
      if (holds.held) state("paused");
      else start();
    } else {
      state("still");
      // Still frame: Americas forward, cage fully drawn, no motion.
      spin.rotation.y = BASE_YAW;
      cageSpin.rotation.y = BASE_YAW * 0.85;
      cageGeo.setDrawRange(0, cageDrawCount);
      render();
    }
  };
  raf = requestAnimationFrame(kick);

  return {
    pause: (reason = "external") => {
      holds.set(reason, true);
      sync();
    },
    resume: (reason = "external") => {
      holds.set(reason, false);
      sync();
    },
    setAmbient: (on) => {
      if (ambient === on) return;
      ambient = on;
      canvas.dataset.globeMode = on ? "ambient" : "full";
      if (!animated) {
        if (booted) render();
      } else if (lowPower) {
        holds.set("low-power", on); // behind the assistant, a still frame only (plan §10)
        sync();
      }
    },
    setPointScale: (k) => {
      g.setPointScale(k);
      if (booted && !running) render();
    },
    redraw: () => {
      if (booted && !animated) render();
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {}
      }
      composer?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
