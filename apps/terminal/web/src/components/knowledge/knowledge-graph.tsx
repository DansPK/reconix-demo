"use client";

/* The Security knowledge graph, drawn on a canvas (lib/knowledge/graph.ts lays it out).

   - Opening: nodes grow in one after another from their place, links fade in behind them.
   - Idle: the layout settles, then every node drifts a little, and a soft glow breathes.
   - Hover: the node grows, its neighbours light up, everything else dims, its label shows.
   - Focus (a click, or a document picked in the list): the camera glides to it, its links
     carry light particles toward it, and a ring pulses around it. Click the background to let go.
   - Drag a node to move it (the layout follows); drag the background to pan; wheel or the
     buttons to zoom; double-click or "Fit" to see everything again.
   With reduced motion: no growing, drift, pulse or particles, and the camera jumps.

   Colours come from the page's tokens (read from CSS at mount), so both themes match. The
   canvas is decoration over data the list beside it already gives in text: it is labelled for
   screen readers, and the details panel speaks the focused node. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";

import { type Graph, type GraphNode, type NodeType, fitView, type Sim, tick, toGraph, type View } from "@/lib/knowledge/graph";

interface Props {
  graph: Graph;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  label: string;
  expanded: boolean; // the graph fills the stage (the document list is folded away)
  onExpand: (expanded: boolean) => void;
}

type RGB = [number, number, number];
type Palette = Record<NodeType, RGB> & { bg: RGB; fg: RGB; muted: RGB; card: RGB; pending: RGB; sans: string; mono: string };

/** Any CSS colour (oklch, hex, …) as RGB: drawn on a 1×1 canvas and read back, since a
    canvas may not understand every colour function the tokens use. */
function toRgb(css: string, fallback: RGB): RGB {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return fallback;
    x.fillStyle = "#000";
    x.fillStyle = css;
    x.fillRect(0, 0, 1, 1);
    const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  } catch {
    return fallback;
  }
}
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const TOKEN: Record<NodeType, string> = {
  DOC: "--primary",
  CVE: "--sev-critical",
  CWE: "--sev-high",
  OWASP: "--sev-medium",
  ATTACK: "--accent",
  TOOL: "--info",
  TOPIC: "--success",
};

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: RGB) => toRgb(css.getPropertyValue(name).trim() || "", fallback);
  // the fonts as families a canvas understands: the body's own, and next/font's mono family
  const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return {
    DOC: v(TOKEN.DOC, [94, 234, 212]),
    CVE: v(TOKEN.CVE, [248, 113, 113]),
    CWE: v(TOKEN.CWE, [251, 146, 60]),
    OWASP: v(TOKEN.OWASP, [250, 204, 21]),
    ATTACK: v(TOKEN.ATTACK, [192, 132, 252]),
    TOOL: v(TOKEN.TOOL, [96, 165, 250]),
    TOPIC: v(TOKEN.TOPIC, [74, 222, 128]),
    bg: v("--card", [11, 18, 21]),
    fg: v("--foreground", [230, 241, 241]),
    muted: v("--muted-foreground", [138, 160, 163]),
    card: v("--card-2", [17, 27, 30]),
    pending: v("--warning", [245, 190, 80]),
    sans,
    mono: mono && !mono.includes("var(") ? `${mono}, ui-monospace, monospace` : "ui-monospace, monospace",
  };
}

/** A number in [0, 1) from a string, so every node floats its own way, the same each time. */
function hash01(text: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** How a node floats: its depth (1 near, ~0.55 far), and the speed and phase of two slow waves
    on each axis. Documents are near and heavy; references lighter and farther. */
type Float = { depth: number; amp: number; f1: number; f2: number; p1: number; p2: number; p3: number; p4: number };
function floatOf(n: GraphNode): Float {
  const doc = n.type === "DOC";
  const r = (salt: number) => hash01(n.id, salt);
  return {
    depth: doc ? 1 : 0.55 + r(1) * 0.4,
    amp: doc ? 10 : 16 + r(2) * 14, // graph units
    f1: 0.16 + r(3) * 0.14,
    f2: 0.27 + r(4) * 0.2,
    p1: r(5) * Math.PI * 2,
    p2: r(6) * Math.PI * 2,
    p3: r(7) * Math.PI * 2,
    p4: r(8) * Math.PI * 2,
  };
}
/** Where the float carries a node at `t` seconds (graph units). */
const floatAt = (f: Float, t: number) => ({
  dx: f.amp * (Math.sin(t * f.f1 + f.p1) * 0.7 + Math.sin(t * f.f2 + f.p2) * 0.3),
  dy: f.amp * (Math.cos(t * f.f1 * 0.9 + f.p3) * 0.7 + Math.sin(t * f.f2 * 1.1 + f.p4) * 0.3),
});

/** The starfield: three layers, the far ones small, dim and slow. Positions in [0, 1). */
type Star = { x: number; y: number; z: number; size: number; tw: number; phase: number };
const STARS: Star[] = Array.from({ length: 220 }, (_, i) => {
  const z = i % 3 === 0 ? 1 : i % 3 === 1 ? 0.6 : 0.3;
  return { x: hash01(`s${i}`, 1), y: hash01(`s${i}`, 2), z, size: 0.6 + z * 1.1 * hash01(`s${i}`, 3), tw: 0.6 + hash01(`s${i}`, 4) * 1.6, phase: hash01(`s${i}`, 5) * Math.PI * 2 };
});

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function KnowledgeGraph({ graph, focusId, onFocus, label, expanded, onExpand }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const target = useRef<View | null>(null);
  const sim = useRef<Sim>({ alpha: 1 });
  const hover = useRef<GraphNode | null>(null);
  const focus = useRef<string | null>(focusId);
  const born = useRef(0); // when the graph appeared (ms)
  const size = useRef({ w: 0, h: 0 });
  const drawn = useRef(new Map<GraphNode, { x: number; y: number; r: number }>()); // last frame, for hit tests
  const pointer = useRef({ x: 0, y: 0 }); // -1…1 from the middle, for the parallax (eased)
  const pointerAim = useRef({ x: 0, y: 0 });
  const moved = useRef(false); // the person panned or zoomed: no more automatic framing
  const framed = useRef(false); // framed once the layout settled
  const [cursor, setCursor] = useState("grab");

  useEffect(() => {
    focus.current = focusId;
  }, [focusId]);

  // a new graph: start the layout and the opening again, then frame it once it has spread out
  useEffect(() => {
    sim.current = { alpha: 1 };
    born.current = performance.now();
    framed.current = false;
    if (reduced()) while (tick(graph, sim.current));
    else for (let i = 0; i < 120; i++) tick(graph, sim.current);
    const { w, h } = size.current;
    if (w && h) {
      target.current = fitView(graph, w, h);
      if (reduced()) view.current = target.current;
    }
  }, [graph]);

  // the focused node: the camera glides to it (closer for a reference)
  useEffect(() => {
    if (!focusId) return;
    const n = graph.byId.get(focusId);
    if (!n) return;
    const k = Math.max(view.current.k, n.type === "DOC" ? 1.15 : 1.6);
    target.current = { x: n.x, y: n.y, k };
    if (reduced()) view.current = target.current;
  }, [focusId, graph]);

  const fit = useCallback(() => {
    moved.current = false; // follow the stage again while it grows or shrinks
    const { w, h } = size.current;
    target.current = fitView(graph, w, h);
    if (reduced()) view.current = target.current;
  }, [graph]);
  const zoomBy = useCallback((f: number) => {
    moved.current = true;
    const v = target.current ?? view.current;
    target.current = { ...v, k: Math.max(0.25, Math.min(4, v.k * f)) };
    if (reduced()) view.current = target.current;
  }, []);

  // size and drawing
  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let palette = readPalette(el);
    const floats = new Map<GraphNode, Float>();
    const still = reduced();

    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const first = size.current.w === 0;
      size.current = { w: r.width, h: r.height };
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (first) {
        view.current = fitView(graph, r.width, r.height);
        view.current = { ...view.current, k: view.current.k * 0.6 }; // opens zoomed out, then glides in
        target.current = fitView(graph, r.width, r.height);
      } else if (!moved.current && !focus.current) {
        target.current = fitView(graph, r.width, r.height); // the stage grew or shrank: frame it again
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();
    const theme = new MutationObserver(() => (palette = readPalette(el)));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { w, h } = size.current;
      if (!w || !h) return;
      const moving = tick(graph, sim.current);
      // once the layout has settled, frame it (unless the person moved the view, or a node is focused)
      if (!moving && !framed.current) {
        framed.current = true;
        if (!moved.current && !focus.current) target.current = fitView(graph, w, h);
      }
      // the camera glides toward its target
      const t = target.current;
      if (t) {
        const v = view.current;
        const s = still ? 1 : 0.12;
        view.current = { x: v.x + (t.x - v.x) * s, y: v.y + (t.y - v.y) * s, k: v.k + (t.k - v.k) * s };
        if (Math.abs(t.x - view.current.x) < 0.05 && Math.abs(t.y - view.current.y) < 0.05 && Math.abs(t.k - view.current.k) < 0.001) target.current = null;
      }
      const v = view.current;
      const age = still ? 1e9 : now - born.current;
      const time = still ? 0 : now / 1000;

      // the pointer's pull on the parallax, eased so space sways rather than jumps
      const aim = pointerAim.current;
      const pt = pointer.current;
      pt.x += (aim.x - pt.x) * (still ? 1 : 0.05);
      pt.y += (aim.y - pt.y) * (still ? 1 : 0.05);

      // background: a slow nebula and a starfield in three layers, each moving with the camera
      // and the pointer by its depth, every star twinkling at its own pace
      ctx.clearRect(0, 0, w, h);
      const nx = w * (0.5 + Math.sin(time * 0.05) * 0.12) - pt.x * 20;
      const ny = h * (0.45 + Math.cos(time * 0.04) * 0.1) - pt.y * 20;
      const nebula = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(w, h) * 0.75);
      nebula.addColorStop(0, rgba(palette.DOC, 0.1));
      nebula.addColorStop(0.45, rgba(palette.ATTACK, 0.035));
      nebula.addColorStop(1, rgba(palette.DOC, 0));
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);
      for (const st of STARS) {
        const sx = ((st.x * w - v.x * v.k * st.z * 0.15 - pt.x * 26 * st.z + time * 2.5 * st.z) % w + w) % w;
        const sy = ((st.y * h - v.y * v.k * st.z * 0.15 - pt.y * 26 * st.z) % h + h) % h;
        const twinkle = still ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * st.tw + st.phase));
        ctx.globalAlpha = (0.18 + st.z * 0.5) * twinkle;
        ctx.fillStyle = rgba(st.z === 1 ? palette.fg : palette.muted);
        ctx.beginPath();
        ctx.arc(sx, sy, st.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const focusNode = focus.current ? graph.byId.get(focus.current) ?? null : null;
      const lit = hover.current ?? focusNode;
      const near = lit ? graph.neighbours.get(lit.id) : null;
      const isLit = (n: GraphNode) => !lit || n === lit || Boolean(near?.has(n.id));
      // each node's place on screen: floating on its own slow orbit, and shifted by the
      // pointer by its depth (the near ones more), as if hung in space
      const pos = new Map<GraphNode, { x: number; y: number; s: number; depth: number }>();
      graph.nodes.forEach((n, i) => {
        let f = floats.get(n);
        if (!f) floats.set(n, (f = floatOf(n)));
        const d = still || n.fixed ? { dx: 0, dy: 0 } : floatAt(f, time);
        const sway = still ? 0 : 1;
        const appear = ease((age - (n.type === "DOC" ? 0 : 260) - i * 9) / 520);
        pos.set(n, {
          x: (n.x + d.dx - v.x) * v.k + w / 2 - pt.x * 18 * f.depth * sway,
          y: (n.y + d.dy - v.y) * v.k + h / 2 - pt.y * 18 * f.depth * sway,
          s: appear,
          depth: f.depth,
        });
      });
      drawn.current.clear();

      // links: soft curves; the lit ones bright, with particles flowing to the lit node
      ctx.lineCap = "round";
      for (const l of graph.links) {
        const a = pos.get(l.source)!;
        const b = pos.get(l.target)!;
        const shown = Math.min(a.s, b.s);
        if (shown <= 0) continue;
        const on = lit && (l.source === lit || l.target === lit);
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12;
        const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
        const colour = palette[l.target.type];
        ctx.globalAlpha = shown * (on ? 0.95 : lit ? 0.06 : 0.28);
        ctx.strokeStyle = rgba(on ? colour : palette.muted);
        ctx.lineWidth = (on ? 1.8 : 1) * Math.min(2, 0.6 + Math.log2(1 + l.weight) * 0.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
        if (on && !still) {
          const toward = l.source === lit ? -1 : 1; // particles travel toward the lit node
          for (let p = 0; p < 3; p++) {
            let u = (time * 0.55 + p / 3 + (l.weight % 7) * 0.13) % 1;
            if (toward < 0) u = 1 - u;
            const q = 1 - u;
            const px = q * q * a.x + 2 * q * u * mx + u * u * b.x;
            const py = q * q * a.y + 2 * q * u * my + u * u * b.y;
            ctx.globalAlpha = 0.9 * shown;
            ctx.fillStyle = rgba(colour);
            ctx.shadowColor = rgba(colour);
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }
      ctx.globalAlpha = 1;

      // nodes: references first, documents on top
      const order = [...graph.nodes].sort((p, q) => (p.type === "DOC" ? 1 : 0) - (q.type === "DOC" ? 1 : 0));
      for (const n of order) {
        const p = pos.get(n)!;
        if (p.s <= 0) continue;
        const colour = n.pending ? palette.pending : palette[n.type];
        const hot = n === hover.current;
        const bob = still ? 1 : 1 + 0.035 * Math.sin(time * 1.1 + p.depth * 9);
        const r = Math.max(n.type === "DOC" ? 10 : 3.5, n.r * v.k) * p.s * (hot ? 1.18 : 1) * (0.8 + 0.2 * p.depth) * bob;
        drawn.current.set(n, { x: p.x, y: p.y, r });
        ctx.globalAlpha = (isLit(n) ? 1 : 0.16) * (0.7 + 0.3 * p.depth);
        // halo
        const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin(time * 1.6 + n.x * 0.01);
        ctx.shadowColor = rgba(colour, 0.9);
        ctx.shadowBlur = (n.type === "DOC" ? 22 : 12) * (hot || n === focusNode ? 1.6 : 0.6 + breathe * 0.4);
        if (n.type === "DOC") {
          const fill = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
          fill.addColorStop(0, rgba(mix(palette.card, colour, 0.55)));
          fill.addColorStop(1, rgba(mix(palette.card, colour, 0.18)));
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(colour);
          // not ingested yet: a dashed ring that turns slowly, like it is still being prepared
          if (n.pending) {
            ctx.setLineDash([5, 4]);
            ctx.lineDashOffset = still ? 0 : -time * 12;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          // the file type, inside
          if (r > 11) {
            ctx.fillStyle = rgba(palette.fg);
            ctx.font = `600 ${Math.max(8, Math.min(12, r * 0.42))}px ${palette.mono}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(n.sub.split(" ")[0], p.x, p.y + 0.5);
          }
        } else {
          ctx.fillStyle = rgba(colour);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = rgba(mix(palette.bg, colour, 0.4));
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // the focused node: a ring that pulses outward
        if (n === focusNode) {
          const pulse = still ? 0 : (time * 0.9) % 1;
          ctx.globalAlpha = 1 - pulse;
          ctx.strokeStyle = rgba(colour);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4 + pulse * 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // labels: documents always, references when close enough, lit or hovered
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      for (const n of order) {
        const p = pos.get(n)!;
        if (p.s < 0.6) continue;
        const doc = n.type === "DOC";
        const show = doc || n === hover.current || (lit ? near?.has(n.id) || n === lit : v.k > 1.15 || n.degree > 1);
        if (!show) continue;
        const r = drawn.current.get(n)?.r ?? Math.max(doc ? 10 : 3.5, n.r * v.k) * p.s;
        const text = clip(n.label, doc ? 28 : 22) + (n.pending ? " · not ingested" : "");
        ctx.font = `${doc ? 600 : 500} ${doc ? 12.5 : 11}px ${palette.sans}`;
        const tw = ctx.measureText(text).width;
        const y = p.y + r + 6;
        ctx.globalAlpha = (isLit(n) ? 1 : 0.25) * Math.min(1, (p.s - 0.6) / 0.4);
        ctx.fillStyle = rgba(palette.bg, 0.82);
        ctx.beginPath();
        ctx.roundRect(p.x - tw / 2 - 6, y - 2, tw + 12, (doc ? 12.5 : 11) + 6, 6);
        ctx.fill();
        ctx.fillStyle = rgba(n.pending ? mix(palette.fg, palette.pending, 0.75) : doc ? palette.fg : mix(palette.fg, palette[n.type], 0.7));
        ctx.fillText(text, p.x, y + 1);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      theme.disconnect();
    };
  }, [graph]);

  // pointer: hover, click to focus, drag a node, drag the background to pan, wheel to zoom
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let drag: { node: GraphNode | null; x: number; y: number; moved: boolean; view: View; dx: number; dy: number } | null = null;
    /** The node under a canvas point, where it is drawn now (floating), the smallest first. */
    const hit = (px: number, py: number): GraphNode | null => {
      let best: { n: GraphNode; r: number } | null = null;
      for (const [n, d] of drawn.current) {
        const rr = d.r + 4;
        if ((d.x - px) ** 2 + (d.y - py) ** 2 <= rr * rr && (!best || d.r < best.r)) best = { n, r: d.r };
      }
      return best?.n ?? null;
    };
    const at = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      const { px, py } = at(e);
      const { w, h } = size.current;
      pointerAim.current = { x: (px / w) * 2 - 1, y: (py / h) * 2 - 1 };
      const g = toGraph(view.current, w, h, px, py);
      if (drag) {
        const dx = px - drag.x;
        const dy = py - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.node) {
          drag.node.x = g.x - drag.dx; // keep the grab point under the pointer
          drag.node.y = g.y - drag.dy;
          sim.current.alpha = Math.max(sim.current.alpha, 0.25);
        } else {
          target.current = null;
          moved.current = true;
          view.current = { ...drag.view, x: drag.view.x - dx / drag.view.k, y: drag.view.y - dy / drag.view.k };
        }
        return;
      }
      hover.current = hit(px, py);
      setCursor(hover.current ? "pointer" : "grab");
    };
    const onDown = (e: PointerEvent) => {
      const { px, py } = at(e);
      const { w, h } = size.current;
      const g = toGraph(view.current, w, h, px, py);
      const node = hit(px, py);
      // a held node stops floating: grab it where it is drawn
      const shown = node ? drawn.current.get(node) : null;
      const from = shown ? toGraph(view.current, w, h, shown.x, shown.y) : g;
      if (node) {
        node.x = from.x;
        node.y = from.y;
        node.fixed = true;
      }
      drag = { node, x: px, y: py, moved: false, view: view.current, dx: g.x - from.x, dy: g.y - from.y };
      el.setPointerCapture(e.pointerId);
      setCursor(node ? "grabbing" : "grabbing");
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      if (drag.node) {
        // it floats again from where it was let go, not from where its orbit would put it
        if (!reduced()) {
          const d = floatAt(floatOf(drag.node), performance.now() / 1000);
          drag.node.x -= d.dx;
          drag.node.y -= d.dy;
        }
        drag.node.fixed = false;
      }
      if (!drag.moved) onFocus(drag.node ? (drag.node.id === focus.current ? null : drag.node.id) : null);
      drag = null;
      el.releasePointerCapture(e.pointerId);
      setCursor(hover.current ? "pointer" : "grab");
    };
    const onLeave = () => {
      if (!drag) hover.current = null;
      pointerAim.current = { x: 0, y: 0 };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { px, py } = at(e);
      const { w, h } = size.current;
      const v = view.current;
      const k = Math.max(0.25, Math.min(4, v.k * Math.exp(-e.deltaY * 0.0015)));
      const before = toGraph(v, w, h, px, py);
      // keep the point under the pointer where it is
      target.current = null;
      moved.current = true;
      view.current = { k, x: before.x - (px - w / 2) / k, y: before.y - (py - h / 2) / k };
    };
    const onDouble = () => {
      const { w, h } = size.current;
      target.current = fitView(graph, w, h);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDouble);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDouble);
    };
  }, [graph, onFocus]);

  return (
    <div ref={wrap} className="kn-graph-canvas">
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        tabIndex={0}
        style={{ cursor }}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoomBy(1.25);
          else if (e.key === "-") zoomBy(0.8);
          else if (e.key === "0") fit();
          else if (e.key === "Escape") onFocus(null);
          else return;
          e.preventDefault();
        }}
      />
      <div className="kn-graph-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">
          <Plus aria-hidden />
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">
          <Minus aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            onExpand(!expanded);
            fit();
          }}
          aria-pressed={expanded}
          aria-label={expanded ? "Show the document list" : "Expand the graph"}
          title={expanded ? "Show the document list" : "Expand the graph (0 or double-click only fits it)"}
        >
          {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
        </button>
      </div>
    </div>
  );
}
