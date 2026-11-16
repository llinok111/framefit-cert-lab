// framefit-cert-lab — pure geometry/camera math. No three.js, no DOM, no I/O.
//
// Question: given a mesh, a view direction and a lens, what is the *smallest*
// camera distance that still keeps every vertex strictly inside the frame
// (with a pixel margin)?  The closed form below is exact for a pinhole camera
// whose target point is fixed: moving backwards along the view axis does not
// change a vertex's projection along right/up, so the constraint is linear in D.
//
// All angles are radians. `margin` is the fraction of the half-frame that the
// content may occupy (margin < 1 leaves a border).  Constants here are scene
// parameters, not tolerances; the only tolerance is EPS_NDC, disclosed in README.

export const EPS_NDC = 1e-9; // dimensionless, used only for "is this vertex outside"
export const WORLD_UP = [0, 1, 0];

export function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vscale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vcross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function vlen(a) { return Math.hypot(a[0], a[1], a[2]); }
export function vnorm(a) {
  const l = vlen(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

// Orthonormal camera basis from yaw/pitch (radians). `fwd` points from the
// camera towards the target. Pitch is clamped away from the poles so that
// right/up stay well defined.
export function makeBasis(yaw, pitch) {
  const p = Math.max(-Math.PI / 2 + 1e-6, Math.min(Math.PI / 2 - 1e-6, pitch));
  const cp = Math.cos(p), sp = Math.sin(p);
  const fwd = [Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp];
  let right = vcross(fwd, WORLD_UP);
  if (vlen(right) < 1e-9) right = [1, 0, 0];
  else right = vnorm(right);
  const up = vnorm(vcross(right, fwd));
  return { fwd, right, up };
}

export function bounds(vertices) {
  if (!vertices.length) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 0 };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of vertices) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let r2 = 0;
  for (const p of vertices) {
    const d = vsub(p, center);
    const q = vdot(d, d);
    if (q > r2) r2 = q;
  }
  return { min, max, center, radius: Math.sqrt(r2) };
}

// Near plane: absolute (`opts.near`) or, by default, a fixed fraction of the
// scene radius. A fractional near plane is what makes framing scale-invariant:
// the near plane is a length, so a fixed 0.01 would dominate a 1e-6-scale scene.
export function nearOf(b, opts) {
  if (opts.near !== undefined) return opts.near;
  const frac = opts.nearFrac ?? 0.005;
  return Math.max(1e-12, frac * b.radius);
}

export function frameSpec(opts) {
  const fovY = opts.fovY, aspect = opts.aspect, margin = opts.margin;
  const tanY = Math.tan(fovY / 2) * margin;
  const tanX = tanY * aspect;
  return { tanX, tanY };
}

// Exact minimal distance. Returns the witness vertex that is tight at D*.
export function fitExact(vertices, opts) {
  const b = bounds(vertices);
  const target = opts.target || b.center;
  const { fwd, right, up } = makeBasis(opts.yaw, opts.pitch);
  const { tanX, tanY } = frameSpec(opts);
  const near = nearOf(b, opts);
  let best = -Infinity, witness = -1, minPf = Infinity, depthWitness = -1;
  for (let i = 0; i < vertices.length; i++) {
    const d = vsub(vertices[i], target);
    const pr = vdot(d, right), pu = vdot(d, up), pf = vdot(d, fwd);
    const need = Math.max(Math.abs(pr) / tanX, Math.abs(pu) / tanY) - pf;
    if (need > best) { best = need; witness = i; }
    if (pf < minPf) { minPf = pf; depthWitness = i; }
  }
  // Two constraints: the vertex projects inside the margin box, and it stays in
  // front of the near plane. Both are linear in D, so the max is exact.
  const depthNeed = near - minPf;
  const distance = Math.max(near, best, depthNeed, 0);
  const bound = distance === depthNeed && depthNeed >= best ? 'depth' : (best >= distance - 1e-15 ? 'margin' : 'near');
  return { distance, witness, depthWitness, bound, target, basis: { fwd, right, up }, tanX, tanY, near };
}

// Real-world baseline: fit the mesh's bounding sphere (centred on the bbox
// centre) into the narrower of the two half-angles. Direction-blind.
export function fitBBoxSphere(vertices, opts) {
  const b = bounds(vertices);
  const { tanX, tanY } = frameSpec(opts);
  const alpha = Math.min(Math.atan(tanY), Math.atan(tanX));
  const distance = alpha > 0 ? b.radius / Math.sin(alpha) : 0;
  return { distance, radius: b.radius, halfAngle: alpha, target: b.center };
}

// Camera position for a given distance.
export function cameraPosition(fit, distance) {
  return vsub(fit.target, vscale(fit.basis.fwd, distance));
}

// Per-vertex "margin-relative NDC": |value| <= 1 means inside the margin box,
// and z > near means in front of the near plane. Forward check, independent of
// the closed form above.
export function measureFrame(vertices, fit, distance) {
  const C = cameraPosition(fit, distance);
  let maxNdc = 0, maxIdx = -1, minDepth = Infinity, outside = 0;
  const nearTol = fit.near * (1 - 1e-9); // relative slack for the z > near test
  for (let i = 0; i < vertices.length; i++) {
    const d = vsub(vertices[i], C);
    const z = vdot(d, fit.basis.fwd);
    const nx = vdot(d, fit.basis.right) / (z * fit.tanX);
    const ny = vdot(d, fit.basis.up) / (z * fit.tanY);
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    if (m > maxNdc) { maxNdc = m; maxIdx = i; }
    if (z < minDepth) minDepth = z;
    if (!(z > nearTol) || m > 1 + EPS_NDC) outside++;
  }
  return { maxNdc, maxIndex: maxIdx, minDepth, outside, camera: C };
}

// Independent oracle: build a 4x4 perspective matrix and a view matrix, project
// every vertex, bisect on D. It shares the scene spec (fov/aspect/margin are
// inputs) but not the closed form, not the witness logic, and has no EPS of its
// own beyond the bisection interval. 100 iterations => interval < 1e-27 * hi.
export function fitByBisection(vertices, opts) {
  const b = bounds(vertices);
  const target = opts.target || b.center;
  const { fwd, right, up } = makeBasis(opts.yaw, opts.pitch);
  const near = nearOf(b, opts);
  const f = 1 / Math.tan(opts.fovY / 2);
  const m = opts.margin;
  const fits = (D) => {
    const C = vsub(target, vscale(fwd, D));
    for (const p of vertices) {
      const d = vsub(p, C);
      const x = vdot(d, right), y = vdot(d, up), z = vdot(d, fwd);
      if (!(z > near)) return false;
      // clip = P * view; w = z (perspective matrix row 4 = [0,0,-1,0])
      const cx = (f / opts.aspect) * x;
      const cy = f * y;
      if (Math.abs(cx) > m * z) return false;
      if (Math.abs(cy) > m * z) return false;
    }
    return true;
  };
  let lo = 0, hi = Math.max(1e-9, 2 * b.radius / Math.max(1e-9, Math.sin(Math.min(Math.atan(m * Math.tan(opts.fovY / 2) * opts.aspect), Math.atan(m * Math.tan(opts.fovY / 2))))) + 1);
  if (fits(lo)) return { distance: 0, iterations: 0 };
  let iter = 0;
  while (iter < 100) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; iter++; }
  return { distance: hi, iterations: iter };
}

// The falsifiability probe: at scale k < 1 relative to the certified D*, at
// least one vertex must fall outside. Returns how many do.
export function probeTighter(vertices, fit, distance, k = 1 - 1e-6) {
  return measureFrame(vertices, fit, distance * k).outside;
}

export function summarize(cases) {
  const savings = cases.map((c) => 1 - c.exact / c.sphere);
  savings.sort((a, b) => a - b);
  const pick = (q) => savings[Math.min(savings.length - 1, Math.floor(q * (savings.length - 1)))];
  return {
    n: cases.length,
    medianSaving: pick(0.5),
    p05Saving: pick(0.05),
    p95Saving: pick(0.95),
    worseCases: cases.filter((c) => c.exact > c.sphere * (1 + 1e-12)).length,
    totalVertices: cases.reduce((s, c) => s + c.vertices, 0),
  };
}

// Recompute every baked case and compare with the reference file. This is the
// same reconciliation the browser runs, kept in core so node can verify it too.
export function reconcileReference(meshes, ref) {
  let checked = 0, mismatches = 0, maxRelDist = 0, worst = null;
  const byName = new Map(meshes.map((m) => [m.name, m]));
  for (const row of ref.cases) {
    const def = byName.get(row.mesh);
    if (!def) { mismatches++; continue; }
    const opts = {
      yaw: row.yaw, pitch: ref.params.pitch, fovY: ref.params.fovY,
      aspect: row.aspect, margin: ref.params.margin, nearFrac: ref.params.nearFrac,
    };
    const f = fitExact(def.vertices, opts);
    const m = measureFrame(def.vertices, f, f.distance);
    const relDist = Math.abs(f.distance - row.exact) / Math.max(1, Math.abs(row.exact));
    maxRelDist = Math.max(maxRelDist, relDist);
    checked++;
    const same = relDist <= 1e-9 && Math.abs(m.maxNdc - row.maxNdc) <= 1e-12 && m.outside === row.outside;
    if (!same) { mismatches++; worst = row.mesh; }
  }
  return { checked, mismatches, maxRelDist, worst };
}
