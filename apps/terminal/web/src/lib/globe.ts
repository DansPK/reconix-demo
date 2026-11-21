/**
 * The hero globe — a lightweight COBE v2 (WebGL shader) globe paired with a tiny 2D overlay for
 * the signature Reconix orbital network cage (~5 kB gzipped, zero Three.js, zero UnrealBloomPass).
 * Automatically detects missing/software WebGL (no GPU) or runtime `webglcontextlost` and falls
 * back cleanly to a pure 2D Canvas renderer with the exact same visual layers (dark obsidian core,
 * cyan rim, teal continent dots, hotspots, arcs, and orbital network cage).
 */
import createGlobe, { type Arc, type COBEOptions, type Globe as CobeGlobe, type Marker } from "cobe";
import { Holds } from "./globe-holds";

export type GlobeControls = {
  /** Stop drawing for `reason`; several reasons can hold it at once ("offscreen", "hidden", the
      assistant's "faded"…). It draws again once every reason is lifted with `resume(reason)`. */
  pause(reason?: string): void;
  resume(reason?: string): void;
  /** Ambient mode, behind the AI Assistant at low opacity: capped to ~30 fps so it stays light
      on the GPU/CPU; on a low-power device it stops on a still frame. */
  setAmbient(on: boolean): void;
  /** Scale its markers (1: as designed), for a canvas shown at another size than it is drawn
      (carried with a CSS scale); a still globe redraws. */
  setPointScale(k: number): void;
  /** Draw one frame now (the still globe under reduced motion, after its canvas moved). */
  redraw(): void;
  destroy(): void;
};

export type GlobeMountOpts = { reducedMotion: boolean; lowPower: boolean; onReady?: () => void };
type Rgb = [number, number, number];
type Vec3 = [number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Americas facing forward on initial load (matches the original globe's orientation).
const BASE_PHI = 1.65;
const BASE_THETA = 0.28;
const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

const HOTSPOTS: [number, number][] = [
  [47, -122], [41, -87], [43, -79], [40, -74], [34, -118], [30, -97], [25, -80],
  [19, -99], [4, -74], [-12, -77], [-23, -46], [-34, -58], [51, 0], [35, 139],
];

const ARC_PAIRS: [number, number][] = [
  [0, 3], [3, 12], [1, 6], [4, 7], [6, 10], [12, 13], [3, 10], [8, 11],
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns true only when hardware-accelerated WebGL is available (rejects missing WebGL,
    major-performance-caveat contexts, and known CPU software renderers). */
export function hasHardwareWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl = (probe.getContext("webgl", attrs) ??
      probe.getContext("experimental-webgl", attrs)) as WebGLRenderingContext | null;
    if (!gl) return false;
    let hardware = true;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "");
      if (SOFTWARE_RENDERER_RE.test(renderer)) hardware = false;
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return hardware;
  } catch {
    return false;
  }
}

function parseColor(raw: string, fallback: Rgb): Rgb {
  const s = raw.trim();
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }
  return fallback;
}

function cssRgb(canvas: HTMLCanvasElement, name: string, fallback: Rgb): Rgb {
  return parseColor(getComputedStyle(canvas).getPropertyValue(name), fallback);
}

function scaleRgb(c: Rgb, factor: number): Rgb {
  return [clamp01(c[0] * factor), clamp01(c[1] * factor), clamp01(c[2] * factor)];
}

function rgbCss(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${alpha.toFixed(3)})`;
}

function buildMarkers(scale: number, color: Rgb): Marker[] {
  const size = Math.max(0.015, Math.min(0.08, 0.036 * scale));
  return HOTSPOTS.map((location, i) => ({
    location,
    size: i % 3 === 0 ? size * 1.25 : size,
    color,
  }));
}

function latLngToUnit(lat: number, lng: number): Vec3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

function projectPoint(p: Vec3, sinP: number, cosP: number, sinT: number, cosT: number): Vec3 {
  const x1 = p[0] * cosP - p[2] * sinP;
  const z1 = p[0] * sinP + p[2] * cosP;
  const y2 = p[1] * cosT - z1 * sinT;
  const z2 = p[1] * sinT + z1 * cosT;
  return [x1, y2, z2];
}

// Deterministic orbital network cage matching the original Reconix cyber-globe look.
function buildCage(): { nodes: Vec3[]; edges: [number, number][] } {
  const rng = mulberry32(7);
  const nodes: Vec3[] = [];
  for (let i = 0; i < 38; i++) {
    const u = rng();
    const v = rng();
    const t = Math.acos(2 * u - 1);
    const p = 2 * Math.PI * v;
    const r = 1.15 + rng() * 0.16;
    nodes.push([r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p)]);
  }
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a !== b && !edgeSet.has(k)) {
      edgeSet.add(k);
      edges.push([a, b]);
    }
  };
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: Math.hypot(n[0] - m[0], n[1] - m[1], n[2] - m[2]) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.floor(rng() * 2));
    near.forEach((x) => addEdge(i, x.j));
  });
  return { nodes, edges };
}

function drawCage(
  ctx: CanvasRenderingContext2D,
  cage: { nodes: Vec3[]; edges: [number, number][] },
  cx: number,
  cy: number,
  r: number,
  phi: number,
  theta: number,
  pr: number,
  pointScale: number,
  color: Rgb,
  reveal = 1,
) {
  if (reveal <= 0.01) return;
  const sinP = Math.sin(phi * 0.85);
  const cosP = Math.cos(phi * 0.85);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const projected = cage.nodes.map((n) => projectPoint(n, sinP, cosP, sinT, cosT));

  const edgeLimit = Math.floor(cage.edges.length * clamp01(reveal));
  ctx.lineWidth = Math.max(0.75, 0.9 * pr);
  for (let i = 0; i < edgeLimit; i++) {
    const [ai, bi] = cage.edges[i];
    const a = projected[ai];
    const b = projected[bi];
    const zMid = (a[2] + b[2]) * 0.5;
    if (zMid < -0.5) continue;
    const alpha = (0.1 + clamp01((zMid + 0.5) / 1.7) * 0.32) * reveal;
    ctx.strokeStyle = rgbCss(color, alpha);
    ctx.beginPath();
    ctx.moveTo(cx + a[0] * r, cy - a[1] * r);
    ctx.lineTo(cx + b[0] * r, cy - b[1] * r);
    ctx.stroke();
  }

  const nodeBase = Math.max(1.2, 2.0 * pr * Math.min(1.5, pointScale));
  projected.forEach((p, i) => {
    if (p[2] < -0.4) return;
    const depth = clamp01((p[2] + 0.4) / 1.6);
    const x = cx + p[0] * r;
    const y = cy - p[1] * r;
    ctx.fillStyle = rgbCss(color, (0.25 + depth * 0.65) * reveal);
    ctx.beginPath();
    ctx.arc(x, y, nodeBase * (0.7 + depth * 0.5), 0, Math.PI * 2);
    ctx.fill();
    if (i % 5 === 0 && depth > 0.35) {
      ctx.strokeStyle = rgbCss(color, depth * 0.42 * reveal);
      ctx.lineWidth = Math.max(0.75, 0.85 * pr);
      ctx.beginPath();
      ctx.arc(x, y, nodeBase * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function fibonacciSphere(count: number): Vec3[] {
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = golden * i;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

/** Pure 2D Canvas fallback globe for machines without a GPU (zero WebGL calls, ~30 fps cap).
    Loads `/globe/land.bin` for real continents (falling back to a Fibonacci sphere if offline) and
    draws the same obsidian core, cyan rim, hotspots, arcs, and orbital network cage. */
export function mountCanvas2DGlobe(canvas: HTMLCanvasElement, opts: GlobeMountOpts): GlobeControls {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.dataset.globeBackend = "css";
    canvas.dataset.globe = "still";
    canvas.dataset.globeMode = "full";
    return {
      pause: () => {},
      resume: () => {},
      setAmbient: () => {},
      setPointScale: () => {},
      redraw: () => {},
      destroy: () => {},
    };
  }

  const { reducedMotion, lowPower } = opts;
  const animated = !reducedMotion;
  const pr = Math.min(window.devicePixelRatio || 1, 1.5);
  const dotColor = cssRgb(canvas, "--globe-dot", [0.18, 0.83, 0.75]);
  const glowColor = cssRgb(canvas, "--globe-glow", [0.13, 0.83, 0.93]);
  const markerColor = cssRgb(canvas, "--primary-strong", [0.13, 0.83, 0.93]);
  const cage = buildCage();
  const spotPts = HOTSPOTS.map(([lat, lng]) => latLngToUnit(lat, lng));
  let landPts: Vec3[] = fibonacciSphere(lowPower ? 260 : 420);
  let cancelled = false;

  // Load real continent points (subsampled for fast CPU 2D projection) when available.
  if (typeof fetch === "function") {
    fetch("/globe/land.bin")
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (!buf || cancelled) return;
        const arr = new Float32Array(buf);
        const total = Math.floor(arr.length / 2);
        const stride = Math.max(1, Math.floor(total / (lowPower ? 700 : 1200)));
        const pts: Vec3[] = [];
        for (let i = 0; i < total; i += stride) {
          pts.push(latLngToUnit(arr[i * 2], arr[i * 2 + 1]));
        }
        if (pts.length > 50) {
          landPts = pts;
          if (booted && !running) draw();
        }
      })
      .catch(() => {});
  }

  let phi = BASE_PHI;
  let phiVel = 0;
  let theta = BASE_THETA;
  let pointScale = 1;
  let ambient = false;
  let sizePx = 320;
  let booted = false;
  let running = false;

  const parent = canvas.parentElement ?? canvas;
  const measureSize = () => {
    const pw = parent.clientWidth || canvas.clientWidth || 320;
    const ph = parent.clientHeight || canvas.clientHeight || 320;
    return Math.max(1, Math.min(pw, ph));
  };

  const syncSize = () => {
    sizePx = measureSize();
    canvas.style.width = `${sizePx}px`;
    canvas.style.height = `${sizePx}px`;
    canvas.width = Math.round(sizePx * pr);
    canvas.height = Math.round(sizePx * pr);
  };
  syncSize();

  const draw = () => {
    const dim = canvas.width;
    const cx = dim / 2;
    const cy = dim / 2;
    const r = dim * 0.36;
    ctx.clearRect(0, 0, dim, dim);

    // Atmospheric outer glow
    const aura = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r * 1.22);
    aura.addColorStop(0, "rgba(0,0,0,0)");
    aura.addColorStop(0.75, rgbCss(glowColor, 0.2));
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
    ctx.fill();

    // Dark obsidian core sphere (#02080a) with cyan Fresnel rim
    const core = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.08, cx, cy, r);
    core.addColorStop(0, "#051419");
    core.addColorStop(0.72, "#02080a");
    core.addColorStop(1, rgbCss(glowColor, 0.28));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // Continent dots
    const dotR = Math.max(0.9, 1.3 * pr * Math.min(1.5, pointScale));
    for (const pt of landPts) {
      const [x, y, z] = projectPoint(pt, sinP, cosP, sinT, cosT);
      if (z < -0.05) continue;
      const depth = clamp01((z + 0.05) / 1.05);
      ctx.fillStyle = rgbCss(dotColor, 0.22 + depth * 0.72);
      ctx.beginPath();
      ctx.arc(cx + x * r, cy - y * r, dotR * (0.7 + depth * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    // Front-side arcs
    ctx.strokeStyle = rgbCss(glowColor, 0.45);
    ctx.lineWidth = Math.max(1, 1.15 * pr);
    for (const [ai, bi] of ARC_PAIRS) {
      const a = projectPoint(spotPts[ai], sinP, cosP, sinT, cosT);
      const b = projectPoint(spotPts[bi], sinP, cosP, sinT, cosT);
      if (a[2] < 0 || b[2] < 0) continue;
      const ax = cx + a[0] * r;
      const ay = cy - a[1] * r;
      const bx = cx + b[0] * r;
      const by = cy - b[1] * r;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - r * 0.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
    }

    // Glowing hotspot markers
    const spotR = Math.max(1.8, 2.4 * pr * Math.min(1.5, pointScale));
    for (const sp of spotPts) {
      const [x, y, z] = projectPoint(sp, sinP, cosP, sinT, cosT);
      if (z < 0.05) continue;
      ctx.fillStyle = rgbCss(markerColor, 0.55 + z * 0.45);
      ctx.beginPath();
      ctx.arc(cx + x * r, cy - y * r, spotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outer orbital network cage
    drawCage(ctx, cage, cx, cy, r, phi, theta, pr, pointScale, markerColor, 1);
  };

  const ro = new ResizeObserver(() => {
    const next = measureSize();
    if (Math.abs(next - sizePx) < 0.5) return;
    syncSize();
    if (booted) draw();
  });
  ro.observe(parent);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastDragMs = -1e9;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    phi += dx * 0.0055;
    phiVel = dx * 0.0055;
    theta = Math.max(-0.45, Math.min(0.85, theta + dy * 0.0045));
    lastDragMs = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    canvas.style.cursor = "grab";
    lastDragMs = performance.now();
  };
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  if (animated) {
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  let raf = 0;
  let lastFrameMs = performance.now();
  let lastDrawMs = 0;
  const FRAME_MS = 1000 / 30;
  const AUTO_SPEED = 0.05;
  const holds = new Holds();
  const state = (s: "running" | "paused" | "still") => (canvas.dataset.globe = s);
  canvas.dataset.globeBackend = "canvas2d";
  canvas.dataset.globeMode = "full";

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - lastDrawMs < FRAME_MS - 4) return;
    lastDrawMs = now;
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameMs) / 1000));
    lastFrameMs = now;
    const sinceDrag = (now - lastDragMs) / 1000;
    const autoFade = clamp01((sinceDrag - 2.0) / 1.2);
    if (!dragging) {
      phiVel *= Math.pow(0.92, dt * 60);
      phi += phiVel + AUTO_SPEED * dt * autoFade;
    }
    draw();
  };

  const start = () => {
    if (running) return;
    running = true;
    state("running");
    lastFrameMs = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (running) state("paused");
    running = false;
    cancelAnimationFrame(raf);
  };
  const sync = () => {
    if (!animated || !booted) return;
    if (holds.held) stop();
    else start();
  };

  raf = requestAnimationFrame(() => {
    booted = true;
    draw();
    opts.onReady?.();
    if (animated) {
      if (holds.held) state("paused");
      else start();
    } else {
      state("still");
    }
  });

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
        if (booted) draw();
      } else if (lowPower) {
        holds.set("low-power", on);
        sync();
      }
    },
    setPointScale: (k) => {
      if (Math.abs(k - pointScale) < 0.01) return;
      pointScale = k;
      if (booted && !running) draw();
    },
    redraw: () => {
      if (booted && !running) draw();
    },
    destroy: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    },
  };
}

export function mountGlobe(canvas: HTMLCanvasElement, opts: GlobeMountOpts): GlobeControls {
  if (!hasHardwareWebGL()) {
    return mountCanvas2DGlobe(canvas, opts);
  }

  const { reducedMotion, lowPower } = opts;
  const animated = !reducedMotion;
  const pr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);

  // Tuned to match the original Reconix Three.js globe: obsidian ocean core (#02080a),
  // glowing teal continents (--globe-dot), subtle cyan rim (--globe-glow), crisp markers & arcs.
  const dotRgb = cssRgb(canvas, "--globe-dot", [0.18, 0.83, 0.75]);
  const glowRgb = cssRgb(canvas, "--globe-glow", [0.13, 0.83, 0.93]);
  const strongRgb = cssRgb(canvas, "--primary-strong", [0.13, 0.83, 0.93]);
  const baseColor = dotRgb;
  const glowColor = scaleRgb(glowRgb, 0.95);
  const markerColor = strongRgb;
  const arcColor = glowRgb;

  const arcs: Arc[] = ARC_PAIRS.map(([a, b]) => ({
    from: HOTSPOTS[a],
    to: HOTSPOTS[b],
    color: arcColor,
  }));

  let pointScale = 1;
  let markers = buildMarkers(pointScale, markerColor);

  let phi = animated ? BASE_PHI - 0.55 : BASE_PHI;
  let phiVel = 0;
  let theta = BASE_THETA;
  let ambient = false;
  let sizePx = 320;
  let booted = false;
  let running = false;

  const parent = canvas.parentElement ?? canvas;
  const measureSize = () => {
    const pw = parent.clientWidth || canvas.clientWidth || 320;
    const ph = parent.clientHeight || canvas.clientHeight || 320;
    return Math.max(1, Math.min(pw, ph));
  };

  sizePx = measureSize();
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;

  // Lightweight 2D overlay canvas for the signature floating orbital network cage around the globe.
  const cage = buildCage();
  const overlay = document.createElement("canvas");
  overlay.className = "dash-globe-canvas pointer-events-none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.width = `${sizePx}px`;
  overlay.style.height = `${sizePx}px`;
  overlay.width = Math.round(sizePx * pr);
  overlay.height = Math.round(sizePx * pr);
  canvas.parentElement?.append(overlay);
  const overlayCtx = overlay.getContext("2d");

  const baseOpts: COBEOptions = {
    devicePixelRatio: pr,
    width: Math.round(sizePx * pr),
    height: Math.round(sizePx * pr),
    phi,
    theta,
    dark: 1,
    diffuse: 1.55,
    mapSamples: lowPower ? 10000 : 16000,
    mapBrightness: 6.8,
    mapBaseBrightness: 0.02,
    baseColor,
    markerColor,
    glowColor,
    markers,
    arcs,
    arcColor,
    arcWidth: 0.34,
    arcHeight: 0.24,
    markerElevation: 0.02,
    scale: animated ? 0.92 : 1.0,
    opacity: 1,
  };

  let globe: CobeGlobe;
  try {
    globe = createGlobe(canvas, baseOpts);
  } catch {
    overlay.remove();
    return mountCanvas2DGlobe(canvas, opts);
  }

  let startMs = performance.now();
  let lastFrameMs = startMs;
  let lastDrawMs = 0;
  let lastDragMs = -1e9;
  const AMBIENT_FRAME_MS = 1000 / 30;
  const AUTO_SPEED = 0.045; // rad/s
  let fallback: GlobeControls | null = null;

  const renderNow = (scale = 1, cageReveal = 1) => {
    const dim = Math.round(sizePx * pr);
    globe.update({
      width: dim,
      height: dim,
      phi,
      theta,
      scale,
      markers,
    });
    if (overlayCtx) {
      if (overlay.width !== dim || overlay.height !== dim) {
        overlay.width = dim;
        overlay.height = dim;
      }
      overlayCtx.clearRect(0, 0, dim, dim);
      // Match COBE's sphere radius (~0.385 * dim at scale=1) so the light & cage sit on the rim.
      const cx = dim / 2;
      const cy = dim / 2;
      const r = dim * 0.385 * scale;
      // Additive atmospheric rim & upper-left key light (matches Three.js BackSide atmosphere + bloom)
      overlayCtx.save();
      overlayCtx.globalCompositeOperation = "lighter";
      const rim = overlayCtx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.55, cx, cy, r * 1.18);
      rim.addColorStop(0, "rgba(0,0,0,0)");
      rim.addColorStop(0.68, rgbCss(glowRgb, 0.16 * cageReveal));
      rim.addColorStop(0.86, rgbCss(glowRgb, 0.28 * cageReveal));
      rim.addColorStop(1, "rgba(0,0,0,0)");
      overlayCtx.fillStyle = rim;
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
      overlayCtx.fill();
      drawCage(overlayCtx, cage, cx, cy, r, phi, theta, pr, pointScale, strongRgb, cageReveal);
      overlayCtx.restore();
    }
  };

  // ---- sizing ----
  const resize = () => {
    const next = measureSize();
    if (Math.abs(next - sizePx) < 0.5) return;
    sizePx = next;
    canvas.style.width = `${sizePx}px`;
    canvas.style.height = `${sizePx}px`;
    overlay.style.width = `${sizePx}px`;
    overlay.style.height = `${sizePx}px`;
    if (booted) renderNow();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(parent);

  // ---- pointer interaction ----
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    phi += dx * 0.0055;
    phiVel = dx * 0.0055;
    theta = Math.max(-0.45, Math.min(0.85, theta + dy * 0.0045));
    lastDragMs = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    canvas.style.cursor = "grab";
    lastDragMs = performance.now();
  };
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  if (animated) {
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---- loop ----
  let raf = 0;
  const holds = new Holds();
  const state = (s: "running" | "paused" | "still") => (canvas.dataset.globe = s);
  canvas.dataset.globeBackend = "webgl";
  canvas.dataset.globeMode = "full";

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (ambient && now - lastDrawMs < AMBIENT_FRAME_MS - 4) return;
    lastDrawMs = now;
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameMs) / 1000));
    lastFrameMs = now;
    const elapsed = (now - startMs) / 1000;

    const introScale = 0.92 + 0.08 * expoOut(clamp01(elapsed / 1.2));
    const cageReveal = expoOut(clamp01((elapsed - 0.35) / 0.9));
    const sinceDrag = (now - lastDragMs) / 1000;
    const autoFade = clamp01((sinceDrag - 2.0) / 1.2);
    if (!dragging) {
      phiVel *= Math.pow(0.92, dt * 60);
      phi += phiVel + AUTO_SPEED * dt * autoFade;
    }

    renderNow(introScale, cageReveal);
  };

  const start = () => {
    if (running) return;
    running = true;
    state("running");
    lastFrameMs = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (running) state("paused");
    running = false;
    cancelAnimationFrame(raf);
  };
  const sync = () => {
    if (!animated || !booted) return;
    if (holds.held) stop();
    else start();
  };

  // Runtime GPU loss: tear down WebGL and degrade cleanly to 2D Canvas on a fresh canvas node.
  const cleanupWebGL = () => {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    overlay.remove();
    globe.destroy();
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    cleanupWebGL();
    const replacement = document.createElement("canvas");
    replacement.className = canvas.className;
    canvas.replaceWith(replacement);
    fallback = mountCanvas2DGlobe(replacement, opts);
    if (ambient) fallback.setAmbient(true);
    if (holds.held) fallback.pause("lost");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  // First paint on next frame so CSS transitions and ResizeObserver settle cleanly.
  raf = requestAnimationFrame(() => {
    booted = true;
    startMs = performance.now();
    lastFrameMs = startMs;
    renderNow(animated ? 0.92 : 1, animated ? 0 : 1);
    opts.onReady?.();
    if (animated) {
      if (holds.held) state("paused");
      else start();
    } else {
      state("still");
    }
  });

  return {
    pause: (reason = "external") => {
      if (fallback) return fallback.pause(reason);
      holds.set(reason, true);
      sync();
    },
    resume: (reason = "external") => {
      if (fallback) return fallback.resume(reason);
      holds.set(reason, false);
      sync();
    },
    setAmbient: (on) => {
      if (fallback) return fallback.setAmbient(on);
      if (ambient === on) return;
      ambient = on;
      canvas.dataset.globeMode = on ? "ambient" : "full";
      if (!animated) {
        if (booted) renderNow(1, 1);
      } else if (lowPower) {
        holds.set("low-power", on);
        sync();
      }
    },
    setPointScale: (k) => {
      if (fallback) return fallback.setPointScale(k);
      if (Math.abs(k - pointScale) < 0.01) return;
      pointScale = k;
      markers = buildMarkers(pointScale, markerColor);
      if (booted && !running) renderNow(1, 1);
    },
    redraw: () => {
      if (fallback) return fallback.redraw();
      if (booted && !running) renderNow(1, 1);
    },
    destroy: () => {
      if (fallback) return fallback.destroy();
      cleanupWebGL();
    },
  };
}
