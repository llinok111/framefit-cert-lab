// Single-query CLI: node tools/fit.mjs --mesh sphere-2 --yaw 30 --pitch 20
// Prints the certified numbers as JSON (same core as browser and bench).
import { readFileSync } from 'node:fs';
import { fitExact, fitBBoxSphere, measureFrame, probeTighter } from '../src/core.mjs';

const args = process.argv.slice(2);
const get = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const meshes = JSON.parse(readFileSync(new URL('../data/meshes.json', import.meta.url))).meshes;
const name = get('mesh', meshes[0].name);
const def = meshes.find((m) => m.name === name);
if (!def) {
  console.error(`unknown mesh "${name}"; available: ${meshes.map((m) => m.name).join(', ')}`);
  process.exit(2);
}
const opts = {
  yaw: (Number(get('yaw', '0')) * Math.PI) / 180,
  pitch: (Number(get('pitch', '20')) * Math.PI) / 180,
  fovY: (Number(get('fov', '45')) * Math.PI) / 180,
  aspect: Number(get('aspect', String(16 / 9))),
  margin: Number(get('margin', '0.9')),
  nearFrac: Number(get('nearFrac', '0.005')),
};
const fit = fitExact(def.vertices, opts);
const sphere = fitBBoxSphere(def.vertices, opts);
const m = measureFrame(def.vertices, fit, fit.distance);
console.log(JSON.stringify({
  mesh: def.name, vertices: def.vertices.length, opts: { ...opts, yawDeg: Number(get('yaw', '0')), pitchDeg: Number(get('pitch', '20')) },
  exactDistance: fit.distance, bboxSphereDistance: sphere.distance,
  saving: 1 - fit.distance / sphere.distance,
  bound: fit.bound, frameWitness: fit.witness, depthWitness: fit.depthWitness,
  maxNdc: m.maxNdc, minDepth: m.minDepth, outside: m.outside,
  outsideIfTighter: probeTighter(def.vertices, fit, fit.distance, 1 - 1e-6),
}, null, 2));
