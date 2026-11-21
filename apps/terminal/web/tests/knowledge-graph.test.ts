/* The Security knowledge graph's model and layout (lib/knowledge/graph.ts): documents linked to
   what they mention, shared references joining them, the filters, the caps, a layout that
   settles with nodes apart and links short, and the camera's maths. */
import { describe, expect, it } from "vitest";

import { buildGraph, fitView, type GraphRef, MAX_REFS, nodeAt, PER_DOC, settle, toGraph, toScreen } from "@/lib/knowledge/graph";

const doc = (id: string, chunks = 3) => ({ id, name: `${id}.md`, kind: "md", chunks });
const ref = (type: GraphRef["type"], ref_id: string, count = 1): GraphRef => ({ type, ref_id, label: ref_id, count });

const docs = [doc("a"), doc("b"), doc("c")];
const refs = {
  a: [ref("CWE", "CWE-89", 3), ref("TOPIC", "sql-injection", 2), ref("CVE", "CVE-2021-44228")],
  b: [ref("CWE", "CWE-89"), ref("TOOL", "NMAP")],
  c: [ref("ATTACK", "T1190")],
};

describe("buildGraph", () => {
  it("links each document to what it mentions; a shared reference is one node", () => {
    const g = buildGraph(docs, refs);
    expect(g.nodes.filter((n) => n.type === "DOC")).toHaveLength(3);
    expect(g.byId.get("CWE:CWE-89")!.degree).toBe(2);
    expect([...g.neighbours.get("CWE:CWE-89")!].sort()).toEqual(["doc:a", "doc:b"]);
    expect(g.links).toHaveLength(6);
    expect(g.byId.get("CWE:CWE-89")!.weight).toBe(4); // passages, summed over documents
  });
  it("filters by type, and to shared references only", () => {
    const tools = buildGraph(docs, refs, new Set(["TOOL"]));
    expect(tools.nodes.filter((n) => n.type !== "DOC").map((n) => n.id)).toEqual(["TOOL:NMAP"]);
    const shared = buildGraph(docs, refs, undefined, true);
    expect(shared.nodes.filter((n) => n.type !== "DOC").map((n) => n.id)).toEqual(["CWE:CWE-89"]);
  });
  it("caps the references per document and in all", () => {
    const many = Array.from({ length: 40 }, (_, i) => ref("CWE", `CWE-${i}`));
    expect(buildGraph([doc("x")], { x: many }).nodes.length).toBe(1 + PER_DOC);
    const docsMany = Array.from({ length: 30 }, (_, d) => doc(`d${d}`));
    const refsMany = Object.fromEntries(docsMany.map((d, i) => [d.id, Array.from({ length: PER_DOC }, (_, j) => ref("TOPIC", `t-${i}-${j}`))]));
    expect(buildGraph(docsMany, refsMany).nodes.filter((n) => n.type !== "DOC")).toHaveLength(MAX_REFS);
  });
  it("marks a document that is not ingested yet", () => {
    const g = buildGraph([{ ...doc("a"), ingested: false }, doc("b")], refs);
    expect(g.byId.get("doc:a")!.pending).toBe(true);
    expect(g.byId.get("doc:b")!.pending).toBe(false);
  });
  it("opens the same way twice", () => {
    const a = buildGraph(docs, refs).nodes.map((n) => [n.x, n.y]);
    const b = buildGraph(docs, refs).nodes.map((n) => [n.x, n.y]);
    expect(a).toEqual(b);
  });
});

describe("the layout", () => {
  it("settles, with no two nodes on top of each other and every link short enough", () => {
    const g = buildGraph(docs, refs);
    const steps = settle(g, { alpha: 1 });
    expect(steps).toBeLessThan(600);
    for (const p of g.nodes)
      for (const q of g.nodes) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((p.r + q.r) * 0.8);
    for (const l of g.links) expect(Math.hypot(l.source.x - l.target.x, l.source.y - l.target.y)).toBeLessThan(400);
  });
});

describe("the camera", () => {
  it("leaves room for each document's name, and keeps a narrow canvas readable", () => {
    const g = buildGraph(docs, refs);
    settle(g, { alpha: 1 });
    for (const [w, h] of [[800, 600], [370, 520]]) {
      const v = fitView(g, w, h);
      for (const n of g.nodes.filter((m) => m.type === "DOC")) {
        const s = toScreen(v, w, h, n.x, n.y);
        expect(s.y + n.r * v.k + 30).toBeLessThanOrEqual(h); // the name under it is on screen
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(w);
      }
      expect(v.k).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("keeps a document with no links near the others", () => {
    const g = buildGraph([...docs, doc("lonely")], refs);
    settle(g, { alpha: 1 });
    const lonely = g.byId.get("doc:lonely")!;
    expect(lonely.degree).toBe(0);
    const far = Math.max(...g.nodes.filter((n) => n !== lonely).map((n) => Math.hypot(n.x, n.y)));
    expect(Math.hypot(lonely.x, lonely.y)).toBeLessThanOrEqual(far * 1.1);
  });

  it("fits every node, maps points both ways, and finds the node under a point", () => {
    const g = buildGraph(docs, refs);
    settle(g, { alpha: 1 });
    const v = fitView(g, 800, 600);
    for (const n of g.nodes) {
      const s = toScreen(v, 800, 600, n.x, n.y);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(800);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(600);
    }
    const back = toGraph(v, 800, 600, 123, 456);
    const there = toScreen(v, 800, 600, back.x, back.y);
    expect([Math.round(there.x), Math.round(there.y)]).toEqual([123, 456]);
    const cwe = g.byId.get("CWE:CWE-89")!;
    expect(nodeAt(g, cwe.x, cwe.y)).toBe(cwe);
    expect(nodeAt(g, 1e6, 1e6)).toBeNull();
  });
});
