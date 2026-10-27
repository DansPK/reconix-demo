// Build the globe's land-dot positions once, offline. Walks a lat/lng grid, keeps the points
// that fall on land, and writes them as a Float32Array [lat, lng, lat, lng, …] to
// public/globe/land.bin. Dev-only deps (world-atlas, topojson-client, d3-geo) stay out of the
// browser bundle — the app only ever fetches the .bin. Commit the .bin; the build does not run this.
//
// Run: npm run globe:points
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const topo = JSON.parse(readFileSync(resolve(root, "node_modules/world-atlas/land-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const LAT_STEP = 0.8;
const MAX_LAT = 84;
const coords = [];
for (let lat = -MAX_LAT; lat <= MAX_LAT; lat += LAT_STEP) {
  // Even spacing on the sphere: widen the longitude step toward the poles.
  const lngStep = LAT_STEP / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let lng = -180; lng < 180; lng += lngStep) {
    if (geoContains(land, [lng, lat])) coords.push(lat, lng);
  }
}

const out = resolve(root, "public/globe/land.bin");
mkdirSync(dirname(out), { recursive: true });
const buf = Float32Array.from(coords);
writeFileSync(out, Buffer.from(buf.buffer));
console.log(`land points: ${coords.length / 2}  ·  ${(buf.byteLength / 1024).toFixed(1)} KiB  ->  public/globe/land.bin`);
