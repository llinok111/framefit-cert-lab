#!/usr/bin/env python3
"""Independent cross-language oracle: re-derive the minimal camera distance in
Python, with its own basis/projection code (no import of core.mjs), and check the
contract on baked cases: inside at D*, outside at D*(1-1e-6).

Run: python3 bench/oracle.py   (exit 0 = all checks pass)
"""
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
meshes = {m["name"]: m for m in json.loads((ROOT / "data/meshes.json").read_text())["meshes"]}
ref = json.loads((ROOT / "data/reference.json").read_text())
P = ref["params"]


def basis(yaw, pitch):
    cp, sp = math.cos(pitch), math.sin(pitch)
    f = [math.sin(yaw) * cp, sp, math.cos(yaw) * cp]
    r = [-f[2], 0.0, f[0]]
    n = math.hypot(*r)
    r = [v / n for v in r]
    u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
    n = math.hypot(*u)
    return f, r, [v / n for v in u]


def inside(vs, D, yaw, aspect, target, near):
    f, r, u = basis(yaw, P["pitch"])
    ty = math.tan(P["fovY"] / 2) * P["margin"]
    tx = ty * aspect
    C = [target[i] - D * f[i] for i in range(3)]
    for p in vs:
        d = [p[i] - C[i] for i in range(3)]
        z = sum(d[i] * f[i] for i in range(3))
        if z <= near:
            return False
        if abs(sum(d[i] * r[i] for i in range(3))) > tx * z:
            return False
        if abs(sum(d[i] * u[i] for i in range(3))) > ty * z:
            return False
    return True


def main():
    random.seed(7)
    sample = random.sample(range(len(ref["cases"])), 8)
    worst = 0.0
    bad = 0
    for k in sample:
        row = ref["cases"][k]
        vs = meshes[row["mesh"]]["vertices"]
        lo3 = [min(p[i] for p in vs) for i in range(3)]
        hi3 = [max(p[i] for p in vs) for i in range(3)]
        target = [(lo3[i] + hi3[i]) / 2 for i in range(3)]
        R = max(math.dist(p, target) for p in vs)
        near = P["nearFrac"] * R
        lo, hi = 0.0, 20 * R + 10
        for _ in range(120):
            mid = (lo + hi) / 2
            if inside(vs, mid, row["yaw"], row["aspect"], target, near):
                hi = mid
            else:
                lo = mid
        rel = abs(hi - row["exact"]) / max(1.0, abs(row["exact"]))
        worst = max(worst, rel)
        at = inside(vs, hi, row["yaw"], row["aspect"], target, near)
        tighter = inside(vs, hi * (1 - 1e-6), row["yaw"], row["aspect"], target, near)
        ok = rel <= 1e-12 and at and not tighter
        bad += 0 if ok else 1
        print(f"{row['mesh']:<18} core={row['exact']:.9f} python={hi:.9f} rel={rel:.2e} inside@D*={at} inside@D*(1-1e-6)={tighter} {'ok' if ok else 'FAIL'}")
    print(f"\n{len(sample) - bad} passed / {bad} failed, max rel diff {worst:.2e}")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
