// Rendering + interaction only. All numbers come from src/core.mjs (no math here).
import * as THREE from 'three';
import {
  fitExact, fitBBoxSphere, measureFrame, probeTighter, bounds, cameraPosition, reconcileReference,
} from './src/core.mjs';

const meshesResp = await fetch('./data/meshes.json');
const meshes = (await meshesResp.json()).meshes;
const ref = await (await fetch('./data/reference.json')).json();

const el = (id) => document.getElementById(id);
const canvas = el('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x1a2230, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 2);
scene.add(key);

let mesh = null;
let fit = null;
let mode = 'exact';

function buildMesh(def) {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(def.vertices.length * 3);
  def.vertices.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(def.indices);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x7fb2e5, metalness: 0.15, roughness: 0.55, flatShading: false,
    side: THREE.DoubleSide,
  });
  mesh = new THREE.Mesh(g, mat);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x2c3f57, transparent: true, opacity: 0.45 }));
  mesh.add(wire);
  scene.add(mesh);
}

let yaw = 0, pitch = 0.35, margin = 0.9, aspect = 16 / 9, fovY = (45 * Math.PI) / 180;

function opts() {
  return { yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180, fovY, aspect, margin };
}

function update() {
  const def = meshes[Number(el('mesh').value)];
  const verts = def.vertices;
  fit = fitExact(verts, opts());
  const sph = fitBBoxSphere(verts, opts());
  const D = mode === 'exact' ? fit.distance : sph.distance;
  const m = measureFrame(verts, fit, D);
  const probe = probeTighter(verts, fit, D, 1 - 1e-6);

  const b = bounds(verts);
  const C = cameraPosition(fit, D);
  camera.fov = (fovY * 180) / Math.PI;
  camera.aspect = aspect;
  camera.near = fit.near;
  camera.far = fit.near + 40 * Math.max(1, b.radius);
  camera.up.set(...fit.basis.up);
  camera.position.set(...C);
  camera.lookAt(new THREE.Vector3(...fit.target));
  camera.updateProjectionMatrix();

  el('sExact').textContent = fit.distance.toFixed(6);
  el('sSphere').textContent = sph.distance.toFixed(6);
  el('sSaving').textContent = `${(100 * (1 - fit.distance / sph.distance)).toFixed(3)}%`;
  el('sBound').textContent = fit.bound;
  el('sWitness').textContent = `#${fit.witness} (frame) / #${fit.depthWitness} (depth)`;
  el('sNdc').textContent = m.maxNdc.toFixed(9);
  el('sOutside').textContent = String(m.outside);
  el('sProbe').textContent = String(probe);
  el('yawVal').textContent = `${yaw.toFixed(1)}°`;
  el('pitchVal').textContent = `${pitch.toFixed(1)}°`;
  el('marginVal').textContent = margin.toFixed(2);
  el('check').innerHTML = `<span class="${window.__mismatch ? 'warn' : 'good'}">node reconciliation: ${window.__checked || 0}/${ref.cases.length} cases, ${window.__mismatch || 0} mismatches</span><br/>reference median saving vs bbox-sphere: ${(ref.summary.medianSaving * 100).toFixed(3)}%`;
}

// ---- interaction: drag orbits, wheel changes margin. No OrbitControls, so the
// rendered camera is always exactly the certified camera.
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw = (yaw + (e.clientX - lastX) * 0.4 + 360) % 360;
  pitch = Math.max(-80, Math.min(80, pitch - (e.clientY - lastY) * 0.3));
  lastX = e.clientX; lastY = e.clientY;
  el('yaw').value = String(yaw); el('pitch').value = String(pitch);
  update();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  margin = Math.max(0.5, Math.min(1, margin - e.deltaY * 0.0004));
  el('margin').value = String(margin);
  update();
}, { passive: false });

for (const id of ['yaw', 'pitch', 'margin']) {
  el(id).addEventListener('input', () => {
    yaw = Number(el('yaw').value); pitch = Number(el('pitch').value); margin = Number(el('margin').value);
    update();
  });
}
for (const id of ['aspect', 'fov']) el(id).addEventListener('change', () => {
  aspect = Number(el('aspect').value); fovY = (Number(el('fov').value) * Math.PI) / 180;
  update();
});
el('mesh').addEventListener('change', () => { buildMesh(meshes[Number(el('mesh').value)]); update(); });
el('fitExact').addEventListener('click', () => { mode = 'exact'; update(); });
el('fitSphere').addEventListener('click', () => { mode = 'sphere'; update(); });

for (const m of meshes) {
  const o = document.createElement('option');
  o.value = String(meshes.indexOf(m));
  o.textContent = `${m.name} (${m.vertexCount} v)`;
  el('mesh').appendChild(o);
}

// ---- node reconciliation: the identical function node asserts in bench/verify.mjs
const rec = reconcileReference(meshes, ref);
window.__checked = rec.checked; window.__mismatch = rec.mismatches;
console.log(`node reconciliation: ${rec.checked} cases, ${rec.mismatches} mismatches`);

buildMesh(meshes[0]);
update();

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  requestAnimationFrame(resize);
}
resize();
