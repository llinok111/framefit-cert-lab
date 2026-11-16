// Deterministic sample generator. `node tools/gen-sample.mjs`
// Writes data/meshes.json. No randomness, no network, no clock.
import { writeFileSync, mkdirSync } from 'node:fs';

function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const v = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  return { vertices: v, indices: f.flat() };
}

function grid(fn, nu, nv, closeU, closeV) {
  const vertices = [], indices = [];
  const nU = closeU ? nu : nu + 1, nV = closeV ? nv : nv + 1;
  for (let j = 0; j < nV; j++) {
    for (let i = 0; i < nU; i++) {
      const u = i / nu, v = j / nv;
      vertices.push(fn(u, v));
    }
  }
  const idx = (i, j) => (j % nV) * nU + (i % nU);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  return { vertices, indices };
}

function torus(R, r, nu, nv) {
  return grid((u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const rr = R + r * Math.cos(b);
    return [rr * Math.cos(a), r * Math.sin(b), rr * Math.sin(a)];
  }, nu, nv, true, true);
}

function sphere(R, nu, nv) {
  return grid((u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI;
    return [R * Math.sin(b) * Math.cos(a), R * Math.cos(b), R * Math.sin(b) * Math.sin(a)];
  }, nu, nv, true, false);
}

function starPrism(points, rOuter, rInner, h) {
  const vertices = [], indices = [];
  const ring = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (const y of [-h / 2, h / 2]) for (const [x, z] of ring) vertices.push([x, y, z]);
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    indices.push(a, n + b, n + a, a, b, n + b);
  }
  const cy = vertices.length;
  vertices.push([0, -h / 2, 0], [0, h / 2, 0]);
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    indices.push(cy, b, a, cy + 1, n + a, n + b);
  }
  return { vertices, indices };
}

function helixTube(turns, radius, tube, nu, nv) {
  return grid((u, v) => {
    const t = u * turns * Math.PI * 2;
    const cx = radius * Math.cos(t), cz = radius * Math.sin(t);
    const a = v * Math.PI * 2;
    const nx = Math.cos(t) * Math.cos(a), ny = Math.sin(a), nz = Math.sin(t) * Math.cos(a);
    return [cx + tube * nx, (u - 0.5) * 3 + tube * ny, cz + tube * nz];
  }, nu, nv, true, true);
}

const meshes = [
  { name: 'plate-20x0.4x2', ...box(20, 0.4, 2) },
  { name: 'rod-12x0.3x0.3', ...box(12, 0.3, 0.3) },
  { name: 'torus-2x0.6', ...torus(2, 0.6, 48, 24) },
  { name: 'sphere-2', ...sphere(2, 40, 24) },
  { name: 'star-prism-5', ...starPrism(5, 3, 1.3, 1.2) },
  { name: 'helix-tube', ...helixTube(3, 2.2, 0.35, 192, 12) },
];

for (const m of meshes) {
  m.vertices = m.vertices.map((p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6)), Number(p[2].toFixed(6))]);
  m.vertexCount = m.vertices.length;
  m.triangleCount = m.indices.length / 3;
}

mkdirSync('data', { recursive: true });
const out = JSON.stringify({ schema: 1, meshes });
writeFileSync('data/meshes.json', out);
const totalV = meshes.reduce((s, m) => s + m.vertexCount, 0);
const totalT = meshes.reduce((s, m) => s + m.triangleCount, 0);
console.log(`wrote data/meshes.json: ${meshes.length} meshes, ${totalV} vertices, ${totalT} triangles, ${out.length} bytes`);
