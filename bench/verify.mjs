// Assertions. `node bench/verify.mjs` — exit 0 only if every check passes.
import { readFileSync } from 'node:fs';
import {
  fitExact, fitBBoxSphere, measureFrame, fitByBisection, probeTighter,
  cameraPosition, bounds, summarize, EPS_NDC,
} from '../src/core.mjs';
import { bboxSphereFit } from '../baseline/naive.mjs';
import { caseList, BASE } from '../tools/scene.mjs';

const data = JSON.parse(readFileSync(new URL('../data/meshes.json', import.meta.url)));
const ref = JSON.parse(readFileSync(new URL('../data/reference.json', import.meta.url)));
const meshes = data.meshes;
const cases = caseList(meshes);
let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${name}: ${detail}`); }
  else { fail++; results.push(`  FAIL ${name}: ${detail}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

// A1 degenerate input
{
  const one = [[1, 2, 3]];
  const f = fitExact(one, { yaw: 0.7, pitch: 0.2, fovY: BASE.fovY, aspect: 1.5, margin: 0.9, near: 0.01 });
  const m = measureFrame(one, f, f.distance);
  ok('A1 degenerate: single point -> near distance, ndc 0', Math.abs(f.distance - 0.01) < 1e-15 && m.maxNdc < 1e-9 && m.outside === 0,
    `D=${f.distance} maxNdc=${m.maxNdc} outside=${m.outside}`);
}

// A2 hand-derived closed form: 20-wide plate seen face-on.
{
  const plate = meshes.find((m) => m.name.startsWith('plate'));
  const opts = { yaw: 0, pitch: 0, fovY: BASE.fovY, aspect: 16 / 9, margin: 0.9, near: 0.01 };
  const f = fitExact(plate.vertices, opts);
  const tanX = Math.tan(BASE.fovY / 2) * 0.9 * (16 / 9);
  // The plate is 2 deep (z in -1..1) and right = -x, so the near-side corner at
  // pf = -1 is the binding one: D = 10/tanX + 1.
  const expected = 10 / tanX + 1;
  ok('A2 analytic plate face-on distance = 10/tanX + halfDepth', rel(f.distance, expected) < 1e-12,
    `D=${f.distance.toFixed(9)} expected=${expected.toFixed(9)} rel=${rel(f.distance, expected).toExponential(2)}`);
}

// A3 tightness + A4 fit + A5 falsification over all 288 cases
{
  let tight = 0, marginBound = 0, fit = 0, outsideTotal = 0, vertsTotal = 0, worstTight = 0;
  let falsified = 0, probeOutTotal = 0;
  for (const c of cases) {
    const verts = meshes[c.meshIndex].vertices;
    const f = fitExact(verts, c);
    const at = measureFrame(verts, f, f.distance);
    if (f.bound === 'margin') { marginBound++; if (Math.abs(at.maxNdc - 1) <= 1e-9) tight++; }
    if (at.outside === 0) fit++;
    worstTight = Math.max(worstTight, Math.abs(at.maxNdc - 1));
    outsideTotal += at.outside; vertsTotal += verts.length;
    const tighter = probeTighter(verts, f, f.distance, 1 - 1e-6);
    if (tighter >= 1) falsified++;
    probeOutTotal += tighter;
    if (f.bound === 'margin' && at.maxNdc < 1 - 1e-9) throw new Error(`margin-bound but not tight ${c.mesh} yaw=${c.yaw}`);
  }
  ok('A3 tight witness: |maxNdc-1| <= 1e-9 on every margin-bound view', tight === marginBound && marginBound > 0,
    `${tight}/${marginBound} margin-bound views (of ${cases.length}), worst |maxNdc-1|=${worstTight.toExponential(2)}`);
  ok('A4 fit guarantee: 0 of 215712 projected vertices outside at D*', fit === cases.length && outsideTotal === 0,
    `views=${fit}/${cases.length} outside=${outsideTotal} vertices=${vertsTotal}`);
  ok('A5 falsifiable minimality: D*(1-1e-6) pushes >=1 vertex out on all views', falsified === cases.length,
    `${falsified}/${cases.length}, geometry outside=${probeOutTotal}`);
}

// A6 independent oracle: perspective matrix + 100-step bisection
{
  let worst = 0, n = 0, iters = 0;
  for (const c of cases) {
    const verts = meshes[c.meshIndex].vertices;
    const f = fitExact(verts, c);
    const o = fitByBisection(verts, c);
    worst = Math.max(worst, rel(o.distance, f.distance));
    iters += o.iterations; n++;
  }
  ok('A6 bisection oracle agrees with closed form (rel <= 1e-9)', worst <= 1e-9,
    `n=${n} maxRel=${worst.toExponential(2)} meanIter=${(iters / n).toFixed(1)}`);
}

// A7 savings vs the bbox-sphere baseline
{
  const inputs = cases.map((c) => {
    const verts = meshes[c.meshIndex].vertices;
    return { exact: fitExact(verts, c).distance, sphere: fitBBoxSphere(verts, c).distance, vertices: verts.length };
  });
  const s = summarize(inputs);
  ok('A7 baseline is strictly more padded on every view', s.worseCases === 0,
    `worse=${s.worseCases}/${s.n}, median=${(s.medianSaving * 100).toFixed(3)}%, p05=${(s.p05Saving * 100).toFixed(3)}%, p95=${(s.p95Saving * 100).toFixed(3)}%`);
  const r = ref.summary;
  ok('A8 baked reference matches live run bit-for-bit', r.n === s.n && r.totalVertices === s.totalVertices && r.medianSaving === s.medianSaving,
    `ref n=${r.n} median=${r.medianSaving} vs live n=${s.n} median=${s.medianSaving}`);
}

// A9 baseline module agrees with core's copy
{
  let worst = 0;
  for (const c of cases) {
    const verts = meshes[c.meshIndex].vertices;
    const a = fitBBoxSphere(verts, c).distance;
    const b = bboxSphereFit(verts, { fovY: c.fovY, aspect: c.aspect, margin: c.margin }).distance;
    worst = Math.max(worst, rel(a, b));
  }
  ok('A9 core.fitBBoxSphere == baseline/naive.mjs', worst <= 1e-12, `maxRel=${worst.toExponential(2)}`);
}

// A10 scale invariance 1e-6 .. 1e6 (length scales linearly, decisions invariant)
{
  let worstDist = 0, worstNdc = 0, worstSphere = 0, outside = 0;
  for (const c of cases.filter((x) => x.aspect === 16 / 9)) {
    const verts = meshes[c.meshIndex].vertices;
    const base = fitExact(verts, c);
    const baseSphere = fitBBoxSphere(verts, c).distance;
    for (const s of [1e-6, 1e-3, 1, 1e3, 1e6]) {
      const sv = verts.map((p) => p.map((v) => v * s));
      const f = fitExact(sv, c);
      const sph = fitBBoxSphere(sv, c).distance;
      worstDist = Math.max(worstDist, Math.abs(f.distance / s - base.distance));
      worstSphere = Math.max(worstSphere, Math.abs(sph / s - baseSphere));
      const m = measureFrame(sv, f, f.distance);
      worstNdc = Math.max(worstNdc, Math.abs(m.maxNdc - 1));
      outside += m.outside;
    }
  }
  ok('A10 scale 1e-6..1e6: distance scales exactly, tightness and 0-outside invariant',
    worstDist <= 1e-9 && worstSphere <= 1e-9 && worstNdc <= 1e-9 && outside === 0,
    `max|D/s-D|=${worstDist.toExponential(2)} max|sphere/s-sphere|=${worstSphere.toExponential(2)} outside=${outside}`);
}

// A11 near plane is a live constraint, not decoration
{
  const plate = meshes.find((m) => m.name.startsWith('plate'));
  const line = [[-5, 0, 0], [5, 0, 0]];
  const edgeOn = { yaw: Math.PI / 2, pitch: 0, fovY: BASE.fovY, aspect: 1, margin: 0.9, nearFrac: 0.01 };
  const f = fitExact(line, edgeOn);
  const m = measureFrame(line, f, f.distance);
  ok('A11 thin line along the view axis is near-plane bound: D = nearFrac*radius + 5', f.bound === 'depth' && Math.abs(f.distance - (0.05 + 5)) < 1e-12 && m.minDepth >= 0.05 - EPS_NDC && m.outside === 0,
    `D=${f.distance.toFixed(6)} bound=${f.bound} minDepth=${m.minDepth.toFixed(6)} outside=${m.outside}`);
  const closer = measureFrame(line, f, f.distance - 1e-4);
  ok('A12 moving 1e-4 closer puts geometry behind the near plane', closer.outside > 0,
    `outside=${closer.outside} minDepth=${closer.minDepth.toFixed(6)}`);
}

// A13 camera position consistency + determinant-free orientation
{
  const torus = meshes.find((m) => m.name.startsWith('torus'));
  const opts = { yaw: 1.1, pitch: 0.3, fovY: BASE.fovY, aspect: 16 / 9, margin: 0.9, near: 0.01 };
  const f = fitExact(torus.vertices, opts);
  const C = cameraPosition(f, f.distance);
  const b = bounds(torus.vertices);
  const targetDist = Math.hypot(C[0] - b.center[0], C[1] - b.center[1], C[2] - b.center[2]);
  ok('A13 camera sits exactly D* from the target', Math.abs(targetDist - f.distance) <= 1e-12,
    `|C-target|=${targetDist.toFixed(12)} D*=${f.distance.toFixed(12)}`);
}

console.log(`framefit-cert-lab verify — node ${process.version}`);
console.log(results.join('\n'));
console.log(`\n${pass} passed / ${fail} failed`);
if (fail) process.exit(1);
