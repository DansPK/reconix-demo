/* The Security knowledge graph's model and layout (pure: browser and tests). Documents are
   linked to what they talk about: exact references (CVE, CWE, OWASP, ATT&CK, tools) and topics.
   A reference two documents share pulls them together, so related documents sit side by side.

   The layout is a small force simulation: every node pushes the others away, every link pulls its
   two ends together, and a weak pull keeps the whole graph near the middle. It cools down
   (`alpha`) and stops once settled; dragging a node warms it up again. Positions are in graph
   units around (0, 0); the view (pan and zoom) is applied when drawing. */

export type RefType = "CVE" | "CWE" | "OWASP" | "ATTACK" | "TOOL" | "TOPIC";
export type NodeType = "DOC" | RefType;

export interface GraphDoc {
  id: string;
  name: string;
  kind: string;
  chunks: number;
  ingested?: boolean; // false: uploaded, not in the knowledge search yet
}
export interface GraphRef {
  type: RefType;
  ref_id: string;
  label: string;
  count: number;
}

export interface GraphNode {
  id: string; // "doc:<id>" or "<TYPE>:<ref_id>"
  type: NodeType;
  label: string;
  sub: string; // a second line: the kind and passages of a document, the type of a reference
  weight: number; // passages that mention it (summed over documents), or a document's passages
  degree: number; // links
  r: number; // radius in graph units
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean; // held by the pointer
  pending: boolean; // a document not ingested yet
}
export interface GraphLink {
  source: GraphNode;
  target: GraphNode;
  weight: number; // passages of the document that mention the reference
}
export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  byId: Map<string, GraphNode>;
  neighbours: Map<string, Set<string>>;
}

export const REF_TYPES: readonly RefType[] = ["CVE", "CWE", "OWASP", "ATTACK", "TOOL", "TOPIC"];
export const TYPE_LABEL: Record<NodeType, string> = {
  DOC: "Document",
  CVE: "CVE",
  CWE: "CWE",
  OWASP: "OWASP",
  ATTACK: "MITRE ATT&CK",
  TOOL: "Tool",
  TOPIC: "Topic",
};

/** At most this many references per document, and in all (the busiest kept). */
export const PER_DOC = 18;
export const MAX_REFS = 260;

const docId = (id: string) => `doc:${id}`;
const refId = (r: Pick<GraphRef, "type" | "ref_id">) => `${r.type}:${r.ref_id}`;

/** A seeded spread, so a graph opens the same way twice. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The graph for these documents and their references. `types`: the reference types shown;
    `sharedOnly`: only references two documents or more mention. */
export function buildGraph(docs: GraphDoc[], refs: Record<string, GraphRef[]>, types: ReadonlySet<RefType> = new Set(REF_TYPES), sharedOnly = false): Graph {
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const add = (n: Omit<GraphNode, "degree" | "r" | "x" | "y" | "vx" | "vy" | "fixed" | "pending"> & { pending?: boolean }) => {
    const node: GraphNode = { pending: false, ...n, degree: 0, r: 0, x: 0, y: 0, vx: 0, vy: 0, fixed: false };
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  };

  // which references each document keeps, and how many documents share each
  const kept = new Map<string, GraphRef[]>();
  const docsOf = new Map<string, number>();
  for (const doc of docs) {
    const mine = (refs[doc.id] ?? []).filter((r) => types.has(r.type)).slice(0, PER_DOC);
    kept.set(doc.id, mine);
    for (const r of mine) docsOf.set(refId(r), (docsOf.get(refId(r)) ?? 0) + 1);
  }
  const totals = new Map<string, number>();
  for (const mine of kept.values()) for (const r of mine) totals.set(refId(r), (totals.get(refId(r)) ?? 0) + r.count);
  const allowed = new Set(
    [...totals.entries()]
      .filter(([id]) => !sharedOnly || (docsOf.get(id) ?? 0) >= 2)
      .sort((a, b) => (docsOf.get(b[0]) ?? 0) - (docsOf.get(a[0]) ?? 0) || b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_REFS)
      .map(([id]) => id),
  );

  for (const doc of docs) {
    const d = add({
      id: docId(doc.id),
      type: "DOC",
      label: doc.name,
      sub: `${doc.kind.toUpperCase()} · ${doc.chunks} ${doc.chunks === 1 ? "passage" : "passages"}`,
      weight: doc.chunks,
      pending: doc.ingested === false,
    });
    for (const r of kept.get(doc.id) ?? []) {
      const id = refId(r);
      if (!allowed.has(id)) continue;
      const node = byId.get(id) ?? add({ id, type: r.type, label: r.label, sub: TYPE_LABEL[r.type], weight: totals.get(id) ?? r.count });
      links.push({ source: d, target: node, weight: r.count });
    }
  }

  const neighbours = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
  for (const l of links) {
    l.source.degree += 1;
    l.target.degree += 1;
    neighbours.get(l.source.id)!.add(l.target.id);
    neighbours.get(l.target.id)!.add(l.source.id);
  }
  // sizes: a document by its passages, a reference by how many documents share it
  for (const n of nodes) n.r = n.type === "DOC" ? 15 + Math.min(13, Math.sqrt(n.weight) * 1.6) : 4.5 + Math.min(10, n.degree * 2.2 + Math.log2(1 + n.weight));
  // start: documents on a ring, each reference near its first document
  const rand = seeded(nodes.map((n) => n.id).join("|"));
  const docNodes = nodes.filter((n) => n.type === "DOC");
  const ring = 70 + docNodes.length * 14;
  docNodes.forEach((n, i) => {
    const a = (i / Math.max(1, docNodes.length)) * Math.PI * 2;
    n.x = Math.cos(a) * ring;
    n.y = Math.sin(a) * ring;
  });
  for (const n of nodes) {
    if (n.type === "DOC") continue;
    const owner = [...neighbours.get(n.id)!].map((id) => byId.get(id)!).find((x) => x.type === "DOC");
    const a = rand() * Math.PI * 2;
    const d = 40 + rand() * 60;
    n.x = (owner?.x ?? 0) + Math.cos(a) * d;
    n.y = (owner?.y ?? 0) + Math.sin(a) * d;
  }
  return { nodes, links, byId, neighbours };
}

export interface Sim {
  alpha: number; // heat: the layout moves while it is above ALPHA_MIN
}
export const ALPHA_MIN = 0.004;

/** One step of the layout. Returns false once it has settled. */
export function tick(g: Graph, sim: Sim): boolean {
  if (sim.alpha < ALPHA_MIN) return false;
  const { nodes, links } = g;
  const a = sim.alpha;
  // every pair pushes apart (fine for the few hundred nodes shown)
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const q = nodes[j];
      let dx = q.x - p.x;
      let dy = q.y - p.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = (i - j) * 0.1;
        dy = 0.1;
        d2 = dx * dx + dy * dy;
      }
      const min = p.r + q.r + 8;
      const strength = (p.type === "DOC" && q.type === "DOC" ? 2600 : 420) / d2 + (d2 < min * min ? 0.9 * (min - Math.sqrt(d2)) / Math.sqrt(d2) : 0);
      const fx = dx * strength * a;
      const fy = dy * strength * a;
      p.vx -= fx;
      p.vy -= fy;
      q.vx += fx;
      q.vy += fy;
    }
  }
  // links pull their ends toward a rest length
  for (const l of links) {
    const dx = l.target.x - l.source.x;
    const dy = l.target.y - l.source.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = 34 + l.source.r + l.target.r;
    const k = ((d - rest) / d) * 0.06 * a * (l.target.degree > 1 ? 1.4 : 1);
    l.source.vx += dx * k;
    l.source.vy += dy * k;
    l.target.vx -= dx * k;
    l.target.vy -= dy * k;
  }
  // a weak pull to the middle, friction, and the move
  for (const n of nodes) {
    // a node with no links has nothing holding it: pull it in harder, or it drifts to the edge
    const pull = n.degree === 0 ? 0.06 : 0.012;
    n.vx -= n.x * pull * a;
    n.vy -= n.y * pull * a;
    if (n.fixed) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += Math.max(-40, Math.min(40, n.vx));
    n.y += Math.max(-40, Math.min(40, n.vy));
  }
  sim.alpha *= 0.985;
  return true;
}

/** Runs the layout until it settles, or `max` steps (for tests, and a first frame). */
export function settle(g: Graph, sim: Sim, max = 600): number {
  let n = 0;
  while (n < max && tick(g, sim)) n++;
  return n;
}

export interface View {
  x: number; // the graph point at the canvas's middle
  y: number;
  k: number; // zoom
}

/** The view that shows every node (`w`, `h`: the canvas in CSS pixels). */
/** How far a node's label reaches past its centre, in CSS pixels: documents always show a name
    under them (about 7 px a character, clipped at 28, plus " · not ingested"). */
function labelReach(n: GraphNode): { x: number; y: number } {
  if (n.type !== "DOC") return { x: 0, y: 0 };
  const chars = Math.min(n.label.length, 28) + (n.pending ? 15 : 0);
  return { x: chars * 3.6 + 6, y: 30 };
}

const FLOAT = 14; // graph units a node drifts while it floats

/** The view that shows every node and its name, with `pad` CSS pixels to spare. On a narrow
    canvas the padding shrinks, and a long name may still reach past the edge rather than the
    graph shrinking to dots. */
export function fitView(g: Graph, w: number, h: number, pad = 48): View {
  if (!g.nodes.length) return { x: 0, y: 0, k: 1 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of g.nodes) {
    x0 = Math.min(x0, n.x - n.r);
    y0 = Math.min(y0, n.y - n.r);
    x1 = Math.max(x1, n.x + n.r);
    y1 = Math.max(y1, n.y + n.r);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const p = Math.min(pad, Math.max(12, Math.min(w, h) * 0.06));
  let k = 2.2;
  for (const n of g.nodes) {
    const reach = labelReach(n);
    const dx = Math.abs(n.x - cx) + n.r + FLOAT;
    const room = Math.max(w * 0.18, w / 2 - p - Math.min(reach.x, w * 0.3));
    k = Math.min(k, room / dx);
    const below = n.y >= cy;
    const dy = Math.abs(n.y - cy) + n.r + FLOAT;
    k = Math.min(k, Math.max(h * 0.18, h / 2 - p - (below ? reach.y : 0)) / dy);
  }
  return { x: cx, y: cy, k: Math.max(0.1, k) };
}

/** A canvas point (CSS pixels) as a graph point, and back. */
export const toGraph = (v: View, w: number, h: number, px: number, py: number) => ({ x: (px - w / 2) / v.k + v.x, y: (py - h / 2) / v.k + v.y });
export const toScreen = (v: View, w: number, h: number, gx: number, gy: number) => ({ x: (gx - v.x) * v.k + w / 2, y: (gy - v.y) * v.k + h / 2 });

/** The node under a graph point (the smallest first, so a reference beats the document under it). */
export function nodeAt(g: Graph, gx: number, gy: number, slack = 4): GraphNode | null {
  let best: GraphNode | null = null;
  for (const n of g.nodes) {
    const dx = n.x - gx;
    const dy = n.y - gy;
    if (dx * dx + dy * dy <= (n.r + slack) ** 2 && (!best || n.r < best.r)) best = n;
  }
  return best;
}

/** How many documents mention each reference shown (for the details panel). */
export function documentsOf(g: Graph, id: string): GraphNode[] {
  return [...(g.neighbours.get(id) ?? [])].map((n) => g.byId.get(n)!).filter((n) => n.type === "DOC");
}
