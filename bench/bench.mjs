// Timing. `node bench/bench.mjs` -> bench/result.json
// 1 warmup + 9 measured repetitions per variant; cold start recorded separately.
import { readFileSync, writeFileSync } from 'node:fs';
import { fitExact, fitBBoxSphere, fitByBisection, summarize } from '../src/core.mjs';
import { caseList } from '../tools/scene.mjs';

const data = JSON.parse(readFileSync(new URL('../data/meshes.json', import.meta.url)));
const meshes = data.meshes;
const cases = caseList(meshes);
const REP = 9;

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const q = (p) => s[Math.min(n - 1, Math.floor(p * (n - 1)))];
  return {
    n, minMs: s[0], medianMs: q(0.5), p95Ms: q(0.95), maxMs: s[n - 1],
    stddevMs: sd, relSD: mean > 0 ? sd / mean : 0,
  };
}

function timeOnce(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

const variants = {
  exact: () => { for (const c of cases) fitExact(meshes[c.meshIndex].vertices, c); },
  bboxSphere: () => { for (const c of cases) fitBBoxSphere(meshes[c.meshIndex].vertices, c); },
  bisectionOracle: () => { for (const c of cases) fitByBisection(meshes[c.meshIndex].vertices, c); },
};

const timings = {};
for (const [name, fn] of Object.entries(variants)) {
  const cold = timeOnce(fn);
  timeOnce(fn); // warmup
  const reps = [];
  for (let i = 0; i < REP; i++) reps.push(timeOnce(fn));
  timings[name] = { ...stats(reps), coldMs: cold };
  console.log(`${name.padEnd(16)} cold ${cold.toFixed(3)} ms | median ${timings[name].medianMs.toFixed(3)} ms | p95 ${timings[name].p95Ms.toFixed(3)} | relSD ${(timings[name].relSD * 100).toFixed(2)}%`);
}

const inputs = cases.map((c) => {
  const v = meshes[c.meshIndex].vertices;
  return { exact: fitExact(v, c).distance, sphere: fitBBoxSphere(v, c).distance, vertices: v.length };
});
const summary = summarize(inputs);
const perMesh = meshes.map((m, mi) => {
  const own = inputs.filter((_, i) => cases[i].meshIndex === mi);
  const s = summarize(own);
  return { mesh: m.name, vertices: m.vertexCount, views: own.length, medianSaving: s.medianSaving, p05: s.p05Saving, p95: s.p95Saving };
});
const result = {
  generated: new Date().toISOString(),
  node: process.version,
  host: `${process.platform}/${process.arch}`,
  cases: cases.length,
  verticesPerPass: summary.totalVertices,
  warmup: 1,
  reps: REP,
  timings,
  speedupVsOracle: timings.bisectionOracle.medianMs / timings.exact.medianMs,
  perCaseUs: (timings.exact.medianMs * 1000) / cases.length,
  summary,
  perMesh,
};
writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(`\nspeedup vs 100-step bisection oracle: ${result.speedupVsOracle.toFixed(1)}x`);
console.log(`median saving vs bbox-sphere: ${(summary.medianSaving * 100).toFixed(3)}% (p05 ${(summary.p05Saving * 100).toFixed(3)}%, p95 ${(summary.p95Saving * 100).toFixed(3)}%)`);
console.log('wrote bench/result.json');
