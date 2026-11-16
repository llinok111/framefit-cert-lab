// Baseline: fit the mesh's bounding sphere (centred on the bbox centre) into the
// narrower half-angle of the frustum. This is what most viewers do. Direction-blind,
// so it over-pads on flat/elongated meshes. Self-contained; runnable: `node baseline/naive.mjs`
import { readFileSync } from 'node:fs';

export function bboxSphereFit(vertices, opts) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of vertices) for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let r2 = 0;
  for (const p of vertices) { const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2]; const q = dx * dx + dy * dy + dz * dz; if (q > r2) r2 = q; }
  const r = Math.sqrt(r2);
  const tanY = Math.tan(opts.fovY / 2) * opts.margin;
  const tanX = tanY * opts.aspect;
  const alpha = Math.min(Math.atan(tanY), Math.atan(tanX));
  return { distance: r / Math.sin(alpha), radius: r, center: c };
}

if (process.argv[1] && process.argv[1].endsWith('naive.mjs')) {
  const data = JSON.parse(readFileSync(new URL('../data/meshes.json', import.meta.url)));
  const opts = { fovY: (45 * Math.PI) / 180, aspect: 16 / 9, margin: 0.9 };
  for (const m of data.meshes) {
    const f = bboxSphereFit(m.vertices, opts);
    console.log(`${m.name.padEnd(18)} r=${f.radius.toFixed(4)}  bbox-sphere distance=${f.distance.toFixed(4)}`);
  }
}
