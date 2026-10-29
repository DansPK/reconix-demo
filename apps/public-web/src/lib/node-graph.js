/**
 * Reconix node graph: a canvas drawing of the platform's components and the
 * tools it orchestrates, with slow drift, pulses travelling along edges and an
 * optional "focus" hub that is lit while the rest dims.
 *
 * Framework-free on purpose: the React wrapper and the static preview both use it.
 */

const HUBS = [
  { id: "reconix", label: "Reconix", x: 0.5, y: 0.5 },
  { id: "terminal", label: "Terminal", x: 0.22, y: 0.3 },
  { id: "backend", label: "Policy Engine", x: 0.5, y: 0.2 },
  { id: "ai", label: "AI Service", x: 0.8, y: 0.34 },
  { id: "tools", label: "Tool Service", x: 0.24, y: 0.74 },
  { id: "knowledge", label: "Knowledge", x: 0.8, y: 0.7 },
  { id: "viewer", label: "Local Viewer", x: 0.52, y: 0.84 },
];

const LEAVES = [
  // terminal
  { hub: "terminal", label: "TUI", sub: "Terminal interface" },
  { hub: "terminal", label: "/template", sub: "Assessment templates" },
  { hub: "terminal", label: "Scope Manifest", sub: "Approval required", kind: "gate" },
  // backend / policy engine
  { hub: "backend", label: "scope check", sub: "Scope validation" },
  { hub: "backend", label: "risk policy", sub: "Risk levels: Low / Medium / High", kind: "gate" },
  { hub: "backend", label: "limits", sub: "Call and time limits" },
  { hub: "backend", label: "audit log", sub: "Audit records" },
  // ai
  { hub: "ai", label: "classify", sub: "CWE · confidence" },
  { hub: "ai", label: "correlate" },
  { hub: "ai", label: "severity", sub: "CVSS" },
  { hub: "ai", label: "vLLM", sub: "local LLM" },
  // tools
  { hub: "tools", label: "Nmap", sub: "network" },
  { hub: "tools", label: "Nuclei", sub: "templates" },
  { hub: "tools", label: "OWASP ZAP", sub: "web · api" },
  { hub: "tools", label: "Semgrep", sub: "code" },
  { hub: "tools", label: "Gitleaks", sub: "secrets" },
  { hub: "tools", label: "Trivy", sub: "deps" },
  // knowledge
  { hub: "knowledge", label: "Qdrant", sub: "hybrid search" },
  { hub: "knowledge", label: "BGE-M3", sub: "embeddings" },
  { hub: "knowledge", label: "NVD", sub: "CVE · CVSS" },
  { hub: "knowledge", label: "OWASP · CWE" },
  { hub: "knowledge", label: "internal", sub: "role-filtered" },
  // viewer
  { hub: "viewer", label: "findings", sub: "by severity" },
  { hub: "viewer", label: "evidence", sub: "masked" },
  { hub: "viewer", label: "report", sub: "PDF" },
];

const HUB_EDGES = [
  ["terminal", "reconix"], ["backend", "reconix"], ["ai", "reconix"],
  ["tools", "reconix"], ["knowledge", "reconix"], ["viewer", "reconix"],
  ["terminal", "backend"], ["backend", "tools"], ["ai", "knowledge"], ["ai", "viewer"],
];

const COLORS = {
  edge: "rgba(45, 212, 191, 0.22)",
  edgeLit: "rgba(45, 212, 191, 0.7)",
  hub: "#f2b544",
  leaf: "#2dd4bf",
  gate: "#f2b544",
  text: "rgba(232, 237, 245, 0.92)",
  sub: "rgba(142, 155, 176, 0.9)",
  pulse: "#99f6e4",
};

export function mountNodeGraph(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let focus = opts.focus || null;
  // camera: relative centre (0..1) and zoom; the draw loop eases toward it
  const view = { x: 0.5, y: 0.5, zoom: 1 }, target = { x: 0.5, y: 0.5, zoom: 1 };
  let dpr = 1, W = 0, H = 0, raf = 0, t0 = performance.now();
  let nodes = [];

  function layout() {
    nodes = [];
    const hubById = {};
    HUBS.forEach((h) => {
      const n = { ...n0(h), kind: "hub" };
      hubById[h.id] = n; nodes.push(n);
    });
    const perHub = {};
    LEAVES.forEach((l) => { (perHub[l.hub] = perHub[l.hub] || []).push(l); });
    Object.entries(perHub).forEach(([hubId, leaves]) => {
      const hub = hubById[hubId];
      const spread = Math.PI * 1.25;
      // fan leaves away from the centre of the canvas
      const base = Math.atan2(hub.y - 0.5, hub.x - 0.5);
      leaves.forEach((l, i) => {
        const a = base - spread / 2 + (spread * (i + 0.5)) / leaves.length;
        const r = 0.13 + (i % 2) * 0.05;
        nodes.push({ ...n0({ ...l, x: hub.x + Math.cos(a) * r * (H / W || 1), y: hub.y + Math.sin(a) * r }), kind: l.kind || "leaf", hub: hubId, seed: Math.random() * 100 });
      });
    });
    nodes.forEach((n, i) => { n.seed = n.seed ?? i * 7.3; });
    return hubById;
  }
  function n0(n) { return { ...n, bx: n.x, by: n.y }; }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    if (reduced) draw(0);
  }

  function pos(n, t) {
    const drift = reduced ? 0 : 1;
    return [
      (n.bx + Math.sin(t * 0.00022 + n.seed) * 0.006 * drift) * W,
      (n.by + Math.cos(t * 0.00019 + n.seed * 1.7) * 0.006 * drift) * H,
    ];
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // ease the camera toward its target, then apply it
    const k = reduced ? 1 : 0.08;
    view.x += (target.x - view.x) * k; view.y += (target.y - view.y) * k; view.zoom += (target.zoom - view.zoom) * k;
    ctx.translate(W / 2, H / 2); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x * W, -view.y * H);
    const byId = {}; nodes.forEach((n) => { if (n.kind === "hub") byId[n.id] = n; });
    const lit = (id) => !focus || id === focus || id === "reconix";
    // each node's brightness eases toward lit (1) or dimmed (0.28), so a focus change glides instead of snapping
    const ka = reduced ? 1 : 0.1;
    nodes.forEach((n) => {
      const goal = (n.kind === "hub" ? lit(n.id) : lit(n.hub)) ? 1 : 0.28;
      n.a = n.a === undefined ? goal : n.a + (goal - n.a) * ka;
    });
    const small = W < 640;

    // hub edges with pulses
    HUB_EDGES.forEach(([a, b], i) => {
      const na = byId[a], nb = byId[b];
      const [ax, ay] = pos(na, t), [bx, by] = pos(nb, t);
      const on = lit(a) && lit(b);
      ctx.strokeStyle = on && focus ? COLORS.edgeLit : COLORS.edge;
      ctx.globalAlpha = Math.min(na.a, nb.a); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (!reduced && on) {
        const p = ((t * 0.00012) + i * 0.17) % 1;
        const px = ax + (bx - ax) * p, py = ay + (by - ay) * p;
        ctx.fillStyle = COLORS.pulse; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    });
    // leaf edges
    nodes.forEach((n) => {
      if (n.kind === "hub") return;
      const h = byId[n.hub]; const [ax, ay] = pos(h, t), [bx, by] = pos(n, t);
      ctx.globalAlpha = n.a * 0.9; ctx.strokeStyle = COLORS.edge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });
    // nodes
    ctx.textBaseline = "middle";
    nodes.forEach((n) => {
      const [x, y] = pos(n, t);
      const on = n.kind === "hub" ? lit(n.id) : lit(n.hub);
      ctx.globalAlpha = n.a;
      if (n.kind === "hub") {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 22);
        glow.addColorStop(0, "rgba(242,181,68,0.35)"); glow.addColorStop(1, "rgba(242,181,68,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.hub; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.text; ctx.font = `600 ${small ? 12 : 14}px var(--font-display), system-ui, sans-serif`;
        ctx.textAlign = "left"; ctx.fillText(n.label, x + 10, y);
      } else {
        const gate = n.kind === "gate";
        ctx.strokeStyle = gate ? COLORS.gate : COLORS.leaf; ctx.lineWidth = 1;
        ctx.fillStyle = gate ? "rgba(242,181,68,0.12)" : "rgba(45,212,191,0.10)";
        roundRect(ctx, x - 11, y - 6, 22, 12, 3); ctx.fill(); ctx.stroke();
        if (gate) { ctx.fillStyle = COLORS.gate; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
        if (!small || on) {
          ctx.textAlign = "left"; ctx.fillStyle = COLORS.text;
          ctx.font = `500 ${small ? 10 : 11}px var(--font-mono), ui-monospace, monospace`;
          ctx.fillText(n.label, x + 15, y - (n.sub ? 5 : 0));
          if (n.sub) { ctx.fillStyle = COLORS.sub; ctx.font = `400 9px var(--font-mono), ui-monospace, monospace`; ctx.fillText(n.sub, x + 15, y + 7); }
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function loop(now) { draw(now - t0); raf = requestAnimationFrame(loop); }

  function start() { if (!raf && !reduced) raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  const ro = new ResizeObserver(resize); ro.observe(canvas);
  resize();
  start();

  return {
    setFocus(id) { focus = id || null; if (reduced) draw(0); },
    /** Move the camera: relative centre and zoom. */
    setView(v) { Object.assign(target, v); if (reduced) draw(0); },
    /** Stop / restart the draw loop (the React wrapper does this when the canvas leaves the viewport). */
    pause: stop,
    resume: start,
    hubs: HUBS,
    destroy() { stop(); ro.disconnect(); },
  };
}

/** Extra scroll after the last hub, in steps of one viewport height: the showcase is (n + SHOWCASE_TAIL) * 100vh tall. */
export const SHOWCASE_TAIL = 1;
/** How long the camera holds on the last hub (in steps) before it pulls back to the whole map. */
const TAIL_HOLD = 0.5;
/** Zoom and centre at which the whole map (hubs, leaves and labels) fits the canvas under the sticky nav. */
const OVERVIEW_ZOOM = 0.84;
const OVERVIEW_Y = 0.53;

/**
 * Camera for the pinned showcase, scrubbed by scroll: `progress` 0..1 across
 * `hubIds.length` steps plus the tail. Between steps the camera glides from one
 * hub to the next and zooms out a little mid-way, so the whole map stays readable.
 * `side` (0..0.5, screen-width fraction) pushes the focused hub away from the
 * text column: odd steps have text on the right, so the hub sits on the left.
 * After the last hub it holds briefly, then pulls back until the whole map is in
 * view; `overview` (0..1) reports that pull-back so the text and shade can clear.
 */
export function showcaseView(progress, hubIds, side = 0) {
  const n = hubIds.length;
  const tailLength = SHOWCASE_TAIL + 0.5; // half a step of lead-in at the start leaves this much after the last hub
  const f = Math.min(n - 1 + tailLength, Math.max(0, progress * (n + SHOWCASE_TAIL) - 0.5));
  const i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const a = HUBS.find((h) => h.id === hubIds[i]);
  const sa = i % 2 === 1 ? 1 : -1;
  const smooth = (v) => v * v * (3 - 2 * v);

  if (i === n - 1) {
    // tail: hold on the last hub, then ease out to the overview and drop the side shift on the way
    const o = smooth(Math.min(1, Math.max(0, (t - TAIL_HOLD) / (tailLength - TAIL_HOLD))));
    const zoom = 1.7 + (OVERVIEW_ZOOM - 1.7) * o;
    return {
      x: a.x + (0.5 - a.x) * o + (sa * side / zoom) * (1 - o),
      y: a.y + (OVERVIEW_Y - a.y) * o,
      zoom,
      index: n - 1,
      overview: o,
    };
  }

  const b = HUBS.find((h) => h.id === hubIds[i + 1]);
  const e = smooth(t);
  const dip = Math.sin(t * Math.PI); // zoom out between hubs
  const zoom = 1.7 - 0.5 * dip;
  const sb = (i + 1) % 2 === 1 ? 1 : -1;
  const shift = (sa + (sb - sa) * e) * side / zoom;
  return {
    x: a.x + (b.x - a.x) * e + shift,
    y: a.y + (b.y - a.y) * e,
    zoom,
    index: Math.min(n - 1, Math.round(f)),
    overview: 0,
  };
}
