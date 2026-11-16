// Bakes the node-side numbers the browser re-computes. `node tools/gen-ref.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import { fitExact, fitBBoxSphere, measureFrame, summarize } from '../src/core.mjs';
import { caseList, BASE, YAWS, ASPECTS } from './scene.mjs';

const data = JSON.parse(readFileSync(new URL('../data/meshes.json', import.meta.url)));
const meshes = data.meshes;
const cases = caseList(meshes);
const rows = [];
const summaryInput = [];
for (const c of cases) {
  const verts = meshes[c.meshIndex].vertices;
  const fit = fitExact(verts, c);
  const sph = fitBBoxSphere(verts, c);
  const m = measureFrame(verts, fit, fit.distance);
  rows.push({
    mesh: c.mesh, yaw: c.yaw, aspect: c.aspect,
    exact: fit.distance, sphere: sph.distance, witness: fit.witness,
    maxNdc: m.maxNdc, minDepth: m.minDepth, outside: m.outside,
    vertices: verts.length,
  });
  summaryInput.push({ exact: fit.distance, sphere: sph.distance, vertices: verts.length });
}
const summary = summarize(summaryInput);
const out = {
  schema: 1,
  params: { ...BASE, yaws: YAWS, aspects: ASPECTS },
  meshNames: meshes.map((m) => m.name),
  cases: rows,
  summary,
};
writeFileSync('data/reference.json', JSON.stringify(out));
console.log(`wrote data/reference.json: ${rows.length} cases, median saving ${(summary.medianSaving * 100).toFixed(3)}%, total vertices ${summary.totalVertices}`);
