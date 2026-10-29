/**
 * The globe's scene, for lib/globe.ts: the camera and the layers (§6.5): core sphere, land dots,
 * ocean dots, hotspots, atmosphere, network cage, connection arcs with comets and ripples, and the
 * starfield. Colours are read from the CSS variables on the canvas at mount time, so the globe
 * stays in step with the tokens. Literal hex here is a fallback only (allowed for the globe module
 * per CLAUDE.md).
 */
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const power2InOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

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

function latLngToVec3(lat: number, lng: number, r: number) {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}

function cssColor(canvas: HTMLCanvasElement, name: string, fallback: string) {
  const v = getComputedStyle(canvas).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

// Soft round / ring sprite textures (generated, not raster assets).
function sprite(kind: "dot" | "ring") {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  if (kind === "dot") {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const HOTSPOTS: [number, number][] = [
  [47, -122], [41, -87], [43, -79], [40, -74], [34, -118], [30, -97], [25, -80],
  [19, -99], [4, -74], [-12, -77], [-23, -46], [-34, -58], [51, 0], [35, 139],
];

// lng −95 faces the camera (Americas, as in the reference)
export const BASE_YAW = THREE.MathUtils.degToRad(95);

export type Arc = { line: Line2; mat: LineMaterial; comet: THREE.Sprite; pts: THREE.Vector3[]; delay: number; t: number };
export type Ripple = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; active: boolean };

/** What the render loop moves and animates. */
export interface GlobeScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  tilt: THREE.Group;
  spin: THREE.Group;
  cageSpin: THREE.Group;
  stars: THREE.Points;
  uTime: { value: number };
  uReveal: { value: number };
  uAtmo: { value: number };
  uNodePop: { value: number };
  land: { ready: boolean };
  cageGeo: THREE.BufferGeometry;
  cageDrawCount: number;
  arcs: Arc[];
  ripples: Ripple[];
  spawnRipple: (p: THREE.Vector3) => void;
  /** Scale every point and line width (1: as designed): a canvas drawn at another resolution
      than it is shown keeps its dots' apparent size. */
  setPointScale: (k: number) => void;
  disposables: { dispose(): void }[];
}

/** Build the scene (and start loading land.bin). `animated` false: everything starts revealed. */
export function buildScene(canvas: HTMLCanvasElement, o: { animated: boolean; pr: number; glowMul: number }): GlobeScene {
  const { animated, pr, glowMul } = o;
  const col = {
    dot: cssColor(canvas, "--globe-dot", "#3cc8d2"),
    glow: cssColor(canvas, "--globe-glow", "#22d3ee"),
    primary: cssColor(canvas, "--primary", "#46e0d4"),
    strong: cssColor(canvas, "--primary-strong", "#7af0ec"),
    dim: cssColor(canvas, "--primary-dim", "#2c7f7c"),
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  camera.position.set(0, 0, 4.4);

  const tilt = new THREE.Group();
  tilt.rotation.x = 0.38;
  tilt.rotation.z = -0.12;
  scene.add(tilt);
  const spin = new THREE.Group();
  const cageSpin = new THREE.Group();
  tilt.add(spin, cageSpin);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o);

  // ---- 1. core sphere ----
  const sphereGeo = track(new THREE.SphereGeometry(1, 96, 96));
  const sphereMat = track(
    new THREE.ShaderMaterial({
      uniforms: { uBase: { value: new THREE.Color("#02080a") }, uRim: { value: col.glow } },
      vertexShader: `varying vec3 vN; varying vec3 vView;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          vView=-mv.xyz;
          vN=normalize(normalMatrix*normal);
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: `uniform vec3 uBase; uniform vec3 uRim; varying vec3 vN; varying vec3 vView;
        void main(){ vec3 N=normalize(vN); vec3 V=normalize(vView);
          float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
          vec3 L=normalize(vec3(-0.6,0.5,0.6)); float ll=clamp(dot(N,L),0.0,1.0);
          vec3 c=uBase*(1.0+0.06*ll)+uRim*fres*0.35; gl_FragColor=vec4(c,1.0); }`,
    }),
  );
  spin.add(new THREE.Mesh(sphereGeo, sphereMat));

  // ---- 2. land dots ----
  const uReveal = { value: animated ? 0 : 1 };
  const START = latLngToVec3(40, -95, 1).normalize();
  const landGeo = track(new THREE.BufferGeometry());
  const land = { ready: false }; // land.bin has loaded
  const landMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uSize: { value: 2.2 * pr },
        uReveal,
        uColor: { value: col.dot },
        uFlash: { value: col.strong },
      },
      vertexShader: `attribute float aNoise; attribute float aDist; uniform float uSize; uniform float uReveal;
        varying float vLight; varying float vShow; varying float vFlash;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=uSize;
          vec3 n=normalize(mat3(modelViewMatrix)*normalize(position)); vec3 L=normalize(vec3(-0.6,0.5,0.6));
          vLight=clamp(dot(n,L),0.0,1.0); float th=aNoise*0.6+aDist*0.4;
          vShow=smoothstep(th-0.02,th+0.02,uReveal); vFlash=clamp(1.0-(uReveal-th)*6.0,0.0,1.0)*vShow; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uFlash; varying float vLight; varying float vShow; varying float vFlash;
        void main(){
          if(vShow<0.01) discard;
          float b=0.35+0.65*vLight;
          vec3 c=mix(uColor*b,uFlash,vFlash*0.8);
          gl_FragColor=vec4(c,vShow);
        }`,
    }),
  );
  const landPoints = new THREE.Points(landGeo, landMat);
  landPoints.frustumCulled = false;
  spin.add(landPoints);

  // ---- 3. ocean dots (sparse texture) ----
  const oceanPos: number[] = [];
  for (let lat = -88; lat <= 88; lat += 2.4) {
    const step = 2.4 / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += step) {
      const v = latLngToVec3(lat, lng, 1.002);
      oceanPos.push(v.x, v.y, v.z);
    }
  }
  const oceanGeo = track(new THREE.BufferGeometry());
  oceanGeo.setAttribute("position", new THREE.Float32BufferAttribute(oceanPos, 3));
  const oceanMat = track(
    new THREE.PointsMaterial({
      color: col.dot,
      size: 1.4 * pr,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  );
  spin.add(new THREE.Points(oceanGeo, oceanMat));

  // ---- 4. hotspots ----
  const hsPos: number[] = [];
  const hsPhase: number[] = [];
  const hsSpeed: number[] = [];
  const hsRng = mulberry32(11);
  for (const [lat, lng] of HOTSPOTS) {
    const v = latLngToVec3(lat, lng, 1.005);
    hsPos.push(v.x, v.y, v.z);
    hsPhase.push(hsRng() * Math.PI * 2);
    hsSpeed.push(0.6 + hsRng() * 0.8);
  }
  const hsGeo = track(new THREE.BufferGeometry());
  hsGeo.setAttribute("position", new THREE.Float32BufferAttribute(hsPos, 3));
  hsGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(hsPhase, 1));
  hsGeo.setAttribute("aSpeed", new THREE.Float32BufferAttribute(hsSpeed, 1));
  const uTime = { value: 0 };
  const hsMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uSize: { value: 4 * pr }, uTime, uColor: { value: col.strong }, uGlow: { value: glowMul } },
      vertexShader: `attribute float aPhase; attribute float aSpeed; uniform float uSize; uniform float uTime; varying float vA;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=uSize;
          vA=0.6+0.4*sin(uTime*aSpeed+aPhase);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uGlow; varying float vA;
        void main(){ vec2 d=gl_PointCoord-0.5; float m=smoothstep(0.5,0.0,length(d)); gl_FragColor=vec4(uColor, vA*m*uGlow); }`,
    }),
  );
  spin.add(new THREE.Points(hsGeo, hsMat));

  // ---- 5. atmosphere ----
  const uAtmo = { value: animated ? 0 : 1 };
  const atmoGeo = track(new THREE.SphereGeometry(1.14, 64, 64));
  const atmoMat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: col.glow }, uIntensity: uAtmo, uGlow: { value: glowMul } },
      vertexShader: `varying vec3 vN; varying vec3 vWN;
        void main(){
          vN=normalize(normalMatrix*normal);
          vWN=normalize(mat3(modelMatrix)*normal);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uIntensity; uniform float uGlow; varying vec3 vN; varying vec3 vWN;
        void main(){ float i=pow(max(0.0,0.65-dot(vN,vec3(0.0,0.0,1.0))),3.0);
          float up=clamp(dot(vWN,normalize(vec3(-0.6,0.5,0.6))),0.0,1.0);
          gl_FragColor=vec4(uColor*i*(0.7+0.6*up)*uIntensity*uGlow,1.0); }`,
    }),
  );
  spin.add(new THREE.Mesh(atmoGeo, atmoMat));

  // ---- 6. network cage ----
  const cageRng = mulberry32(7);
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < 44; i++) {
    const u = cageRng();
    const v = cageRng();
    const theta = Math.acos(2 * u - 1);
    const phi = 2 * Math.PI * v;
    const r = 1.16 + cageRng() * 0.18;
    nodes.push(new THREE.Vector3(r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)));
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
      .map((m, j) => ({ j, d: n.distanceTo(m) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.floor(cageRng() * 2));
    near.forEach((x) => addEdge(i, x.j));
  });
  for (let i = 0; i < 6; i++) addEdge(Math.floor(cageRng() * 44), Math.floor(cageRng() * 44));
  const edgePos: number[] = [];
  edges.forEach(([a, b]) => {
    edgePos.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z);
  });
  const cageGeo = track(new THREE.BufferGeometry());
  cageGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePos, 3));
  const cageMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: col.strong }, uGlow: { value: glowMul } },
      vertexShader: `varying float vFront; void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        vFront=smoothstep(-5.7,-3.1,mv.z);
        gl_Position=projectionMatrix*mv;
      }`,
      fragmentShader: `uniform vec3 uColor; uniform float uGlow; varying float vFront; void main(){
        gl_FragColor=vec4(uColor, mix(0.25,1.0,vFront)*0.5*uGlow);
      }`,
    }),
  );
  const cageLines = new THREE.LineSegments(cageGeo, cageMat);
  cageLines.frustumCulled = false;
  const cageDrawCount = edges.length * 2;
  if (animated) cageGeo.setDrawRange(0, 0);
  cageSpin.add(cageLines);

  // cage nodes
  const nodeTex = track(sprite("dot"));
  const ringTex = track(sprite("ring"));
  const nodeGeo = track(new THREE.BufferGeometry());
  const nodeSizes: number[] = [];
  const nodePos: number[] = [];
  nodes.forEach((n) => {
    nodePos.push(n.x, n.y, n.z);
    nodeSizes.push((5 + cageRng() * 4) * pr);
  });
  nodeGeo.setAttribute("position", new THREE.Float32BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(nodeSizes, 1));
  const uNodePop = { value: animated ? 0 : 1 };
  const uPointScale = { value: 1 }; // setPointScale
  const nodeMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: nodeTex }, uColor: { value: col.strong }, uPop: uNodePop, uScale: uPointScale, uGlow: { value: glowMul } },
      vertexShader: `attribute float aSize; uniform float uPop; uniform float uScale; void main(){
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_PointSize=aSize*uPop*uScale;
      }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uGlow; void main(){
        float a=texture2D(uTex,gl_PointCoord).a;
        gl_FragColor=vec4(uColor, a*uGlow);
      }`,
    }),
  );
  cageSpin.add(new THREE.Points(nodeGeo, nodeMat));
  // ring overlay on 1 in 5 nodes
  const ringPos: number[] = [];
  const ringSizes: number[] = [];
  nodes.forEach((n, i) => {
    if (i % 5 === 0) {
      ringPos.push(n.x, n.y, n.z);
      ringSizes.push(nodeSizes[i] * 2.2);
    }
  });
  const ringGeo = track(new THREE.BufferGeometry());
  ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPos, 3));
  ringGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(ringSizes, 1));
  const ringMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: ringTex }, uColor: { value: col.strong }, uPop: uNodePop, uScale: uPointScale, uGlow: { value: glowMul } },
      vertexShader: `attribute float aSize; uniform float uPop; uniform float uScale; void main(){
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        gl_PointSize=aSize*uPop*uScale;
      }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uGlow; void main(){
        float a=texture2D(uTex,gl_PointCoord).a;
        gl_FragColor=vec4(uColor, a*0.8*uGlow);
      }`,
    }),
  );
  cageSpin.add(new THREE.Points(ringGeo, ringMat));

  // ---- 7. connection arcs + comets ----
  const ARC_SEG = 60;
  const arcs: Arc[] = [];
  const cometTex = track(sprite("dot"));
  const arcRng = mulberry32(23);
  for (let i = 0; i < 8; i++) {
    const [la1, ln1] = HOTSPOTS[Math.floor(arcRng() * HOTSPOTS.length)];
    const [la2, ln2] = HOTSPOTS[Math.floor(arcRng() * HOTSPOTS.length)];
    const a = latLngToVec3(la1, ln1, 1);
    const b = latLngToVec3(la2, ln2, 1);
    if (a.distanceTo(b) < 0.2) continue;
    const ang = a.angleTo(b);
    const lift = 0.18 + (0.25 * ang) / Math.PI;
    const pts: THREE.Vector3[] = [];
    const flat: number[] = [];
    for (let s = 0; s <= ARC_SEG; s++) {
      const f = s / ARC_SEG;
      const p = new THREE.Vector3().copy(a).lerp(b, f).normalize();
      p.multiplyScalar(1 + lift * Math.sin(Math.PI * f));
      pts.push(p);
      flat.push(p.x, p.y, p.z);
    }
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const mat = new LineMaterial({
      color: col.strong.getHex(),
      linewidth: 1.5,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    mat.resolution.set(1, 1);
    const line = new Line2(geo, mat);
    line.frustumCulled = false;
    const cometMat = new THREE.SpriteMaterial({
      map: cometTex,
      color: col.strong,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const comet = new THREE.Sprite(track(cometMat));
    comet.scale.setScalar(0.08);
    spin.add(line, comet);
    disposables.push(geo, mat);
    arcs.push({ line, mat, comet, pts, delay: i * 0.5, t: -i * 0.5 });
  }

  // ripple pool
  const ripGeo = track(new THREE.RingGeometry(0.9, 1, 24));
  const ripples: Ripple[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = track(
      new THREE.MeshBasicMaterial({
        color: col.strong,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(ripGeo, mat);
    mesh.visible = false;
    spin.add(mesh);
    ripples.push({ mesh, mat, t: 0, active: false });
  }
  const spawnRipple = (p: THREE.Vector3) => {
    const r = ripples.find((x) => !x.active);
    if (!r) return;
    r.active = true;
    r.t = 0;
    r.mesh.visible = true;
    r.mesh.position.copy(p);
    r.mesh.lookAt(p.clone().multiplyScalar(2));
  };

  // ---- 8. starfield ----
  const starPos: number[] = [];
  const starMeta: number[] = [];
  const starCol: number[] = [];
  const starRng = mulberry32(99);
  for (let i = 0; i < 1800; i++) {
    const u = starRng();
    const v = starRng();
    const theta = Math.acos(2 * u - 1);
    const phi = 2 * Math.PI * v;
    const r = 30 + starRng() * 30;
    starPos.push(r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi));
    starMeta.push(0.8 + starRng() * 0.8, starRng() * Math.PI * 2, 0.25 + starRng() * 0.65);
    const c = starRng() < 0.2 ? col.dot : new THREE.Color(0xffffff);
    starCol.push(c.r, c.g, c.b);
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute("aMeta", new THREE.Float32BufferAttribute(starMeta, 3));
  starGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(starCol, 3));
  const starMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime, uPr: { value: pr } },
      vertexShader: `attribute vec3 aMeta; attribute vec3 aColor; uniform float uTime; uniform float uPr; varying vec3 vC; varying float vA;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aMeta.x*uPr;
          vC=aColor; vA=aMeta.z*(0.6+0.4*sin(uTime*1.5+aMeta.y)); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){
        vec2 d=gl_PointCoord-0.5;
        float m=smoothstep(0.5,0.0,length(d));
        gl_FragColor=vec4(vC, vA*m);
      }`,
    }),
  );
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- land.bin load ----
  fetch("/globe/land.bin")
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const raw = new Float32Array(buf);
      const n = raw.length / 2;
      const pos = new Float32Array(n * 3);
      const noise = new Float32Array(n);
      const dist = new Float32Array(n);
      const lrng = mulberry32(5);
      for (let i = 0; i < n; i++) {
        const v = latLngToVec3(raw[i * 2], raw[i * 2 + 1], 1.003);
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;
        noise[i] = lrng();
        dist[i] = clamp01(v.clone().normalize().angleTo(START) / Math.PI);
      }
      landGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      landGeo.setAttribute("aNoise", new THREE.BufferAttribute(noise, 1));
      landGeo.setAttribute("aDist", new THREE.BufferAttribute(dist, 1));
      land.ready = true;
    })
    .catch(() => {});

  const setPointScale = (k: number) => {
    landMat.uniforms.uSize.value = 2.2 * pr * k;
    oceanMat.size = 1.4 * pr * k;
    hsMat.uniforms.uSize.value = 4 * pr * k;
    uPointScale.value = k;
    starMat.uniforms.uPr.value = pr * k;
    for (const a of arcs) a.mat.linewidth = 1.5 * k;
  };

  return {
    setPointScale,
    ...{ scene, camera, tilt, spin, cageSpin, stars, uTime, uReveal, uAtmo, uNodePop, land },
    ...{ cageGeo, cageDrawCount, arcs, ripples, spawnRipple, disposables },
  };
}
