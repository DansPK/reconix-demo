/**
 * Cursor-reactive dot field: a grid of dots that only moves when the pointer does.
 * Dots near the pointer swell, brighten toward the primary colour and are pushed
 * away ("antigravity"), then spring back to their grid spot. The loop runs only
 * while something is still moving, so an idle page costs nothing.
 *
 * Static (one draw, no listeners) under prefers-reduced-motion or without a fine pointer.
 * Framework-free: `components/dot-field.tsx` mounts it.
 */

export type DotFieldOptions = {
  /** px between dots */
  spacing?: number;
  /** px, radius of the pointer's influence */
  radius?: number;
  /** px, how far a dot right under the pointer is pushed away */
  push?: number;
  /** extra radius at the pointer, as a multiple of the base radius (1.8 = up to 2.8x) */
  grow?: number;
};

export type DotFieldHandle = { destroy(): void };

type RGB = [number, number, number];

/** Parses `#rrggbb` or `rgb()/rgba()`; tokens are hex, computed `color` is rgb(). */
function parseColor(value: string): RGB | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : null;
}

const FAR = -1e9;

export function mountDotField(canvas: HTMLCanvasElement, opts: DotFieldOptions = {}): DotFieldHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy() {} };

  const spacing = opts.spacing ?? 24;
  const radius = opts.radius ?? 150;
  const push = opts.push ?? 14;
  const grow = opts.grow ?? 1.8;
  const interactive =
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.matchMedia("(pointer: fine)").matches;

  // colours come from the tokens the canvas inherits; the computed `color` (always rgb()) is the last resort
  const cs = getComputedStyle(canvas);
  const text = parseColor(cs.color) ?? [128, 128, 128];
  const base = parseColor(cs.getPropertyValue("--foreground")) ?? text;
  const lit = parseColor(cs.getPropertyValue("--primary")) ?? text;
  const baseStyle = `rgba(${base[0]},${base[1]},${base[2]},0.14)`;

  let W = 0, H = 0, count = 0;
  let rx = new Float32Array(0), ry = rx, ox = rx, oy = rx, vx = rx, vy = rx, glow = rx;
  const mouse = { x: FAR, y: FAR };
  const client = { x: FAR, y: FAR }; // last pointer position in viewport coords, re-projected on scroll
  let raf = 0;

  function build() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = Math.ceil(W / spacing) + 1, rows = Math.ceil(H / spacing) + 1;
    count = cols * rows;
    rx = new Float32Array(count); ry = new Float32Array(count);
    ox = new Float32Array(count); oy = new Float32Array(count);
    vx = new Float32Array(count); vy = new Float32Array(count);
    glow = new Float32Array(count);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        rx[k] = i * spacing + spacing / 2;
        ry[k] = j * spacing + spacing / 2;
      }
    }
    draw();
  }

  /** Advances the springs one frame; returns true while anything is still moving. */
  function step(): boolean {
    let energy = 0;
    const r2 = radius * radius;
    for (let k = 0; k < count; k++) {
      const dx = rx[k] - mouse.x, dy = ry[k] - mouse.y;
      const d2 = dx * dx + dy * dy;
      let tx = 0, ty = 0, tg = 0;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 0.001;
        const f = 1 - d / radius; // 1 under the pointer, 0 at the edge of its reach
        const s = f * f * push;
        tx = (dx / d) * s; ty = (dy / d) * s; tg = f;
      }
      vx[k] = (vx[k] + (tx - ox[k]) * 0.16) * 0.72;
      vy[k] = (vy[k] + (ty - oy[k]) * 0.16) * 0.72;
      ox[k] += vx[k]; oy[k] += vy[k];
      glow[k] += (tg - glow[k]) * 0.18;
      energy += Math.abs(vx[k]) + Math.abs(vy[k]) + Math.abs(tg - glow[k]);
    }
    return energy > 0.05;
  }

  function draw() {
    ctx!.clearRect(0, 0, W, H);
    ctx!.fillStyle = baseStyle;
    let usingBase = true;
    for (let k = 0; k < count; k++) {
      const g = glow[k];
      if (g > 0.01) {
        const r = base[0] + (lit[0] - base[0]) * g, gg = base[1] + (lit[1] - base[1]) * g, b = base[2] + (lit[2] - base[2]) * g;
        ctx!.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${0.14 + 0.66 * g})`;
        usingBase = false;
      } else if (!usingBase) {
        ctx!.fillStyle = baseStyle;
        usingBase = true;
      }
      ctx!.beginPath();
      ctx!.arc(rx[k] + ox[k], ry[k] + oy[k], 1 + grow * g, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  function loop() {
    const moving = step();
    draw();
    raf = moving ? requestAnimationFrame(loop) : 0;
  }
  function wake() { if (!raf) raf = requestAnimationFrame(loop); }

  /** Projects the last viewport pointer position into canvas space (FAR when out of reach). */
  function project() {
    if (client.x === FAR) { mouse.x = mouse.y = FAR; return; }
    const rect = canvas.getBoundingClientRect();
    const x = client.x - rect.left, y = client.y - rect.top;
    const out = x < -radius || y < -radius || x > W + radius || y > H + radius;
    mouse.x = out ? FAR : x; mouse.y = out ? FAR : y;
  }
  function onMove(e: PointerEvent) { client.x = e.clientX; client.y = e.clientY; project(); wake(); }
  function onLeave() { client.x = client.y = FAR; project(); wake(); }
  function onScroll() { if (client.x !== FAR) { project(); wake(); } }

  const ro = new ResizeObserver(build);
  ro.observe(canvas);
  build();
  if (interactive) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    },
  };
}
