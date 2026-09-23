// Signed distance primitives and operators (scalar math, no allocations).
'use strict';

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function mix(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Polynomial smooth min / max (Inigo Quilez).
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// Ellipsoid (approximate, bound-correct near the surface).
function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return k0 * (k0 - 1) / k1;
}

// Capsule with linearly varying radius (round cone approximation).
function capsule(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - mix(ra, rb, h);
}

// Signed distance to a half-space: n·p - d (n normalized); negative on the inside.
function plane(px, py, pz, nx, ny, nz, d) { return nx * px + ny * py + nz * pz - d; }

module.exports = { clamp, mix, smoothstep, smin, smax, ellipsoid, capsule, plane };
