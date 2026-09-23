// Anime head definition: one continuous skin volume + a draped hair volume.
// Units: head height (crown to chin) ~= 2.0, +Y up, +Z forward (face), +X to the model's left.
'use strict';
const { smin, smax, ellipsoid, capsule, clamp, mix, smoothstep } = require('./sdf');

// ---------------------------------------------------------------- skin ----

function skin(x, y, z) {
  const ax = Math.abs(x);

  // Cranium and lower face are two volumes melted together so there is no seam
  // or hinge anywhere (that is what makes heads read as puppets).
  const cranium = ellipsoid(x, y, z, 0, 0.14, -0.07, 0.80, 0.86, 0.86);

  let face = ellipsoid(x, y, z, 0, -0.22, 0.02, 0.70, 0.86, 0.72);
  // Front-view V jawline: (0.68,-0.30) -> (0.10,-0.98).
  face = smax(face, 0.761 * (ax - 0.68) - 0.649 * (y + 0.30), 0.14);
  // Side-view under-jaw plane: chin (y=-0.98,z=0.50) -> throat (y=-0.62,z=-0.35).
  face = smax(face, -0.921 * (y + 0.98) - 0.390 * (z - 0.50), 0.10);

  let d = smin(cranium, face, 0.12);

  // Cheek fullness just below the eyes keeps the face soft instead of carved.
  d = smin(d, ellipsoid(ax, y, z, 0.30, -0.33, 0.42, 0.19, 0.15, 0.2), 0.1);

  // Very shallow eye beds: anime eyes sit almost flush with the face.
  d = smax(d, -ellipsoid(ax, y, z, 0.30, -0.13, 0.86, 0.20, 0.16, 0.16), 0.07);

  // Small nose: soft bridge that ends in a tiny tip.
  d = smin(d, capsule(x, y, z, 0, -0.24, 0.695, 0, -0.43, 0.745, 0.008, 0.024), 0.07);

  // Mouth: faint groove + tiny lower-lip swell.
  d = smax(d, -capsule(x, y, z, -0.075, -0.655, 0.655, 0.075, -0.655, 0.655, 0.008, 0.008), 0.015);
  d = smin(d, ellipsoid(x, y, z, 0, -0.70, 0.612, 0.055, 0.018, 0.025), 0.03);

  // Ears (mostly hidden by hair, but they keep the silhouette believable).
  d = smin(d, ellipsoid(ax, y, z, 0.70, -0.22, -0.12, 0.09, 0.19, 0.12), 0.05);

  // Neck, blended with a generous radius; cut flat at the bottom.
  const neck = capsule(x * 0.94, y, z, 0, -0.45, -0.24, 0, -1.9, -0.3, 0.25, 0.33);
  d = smin(d, neck, 0.16);
  d = smax(d, -1.42 - y, 0.02);
  return d;
}

// --------------------------------------------------------------- hair -----
// Hair = a sculpted bob shell (clump grooves, pointed tips, hollow inside)
// + bangs and side locks grown as clumps that drape over the head.

const SHELL_C = [0, 0.1, -0.12];
const TAU = Math.PI * 2;

function shellBase(x, y, z, shrink = 0) {
  const fl = 1 + 0.07 * smoothstep(0.3, -0.6, y); // gentle flare toward the ends
  return ellipsoid(x / fl, y, (z - SHELL_C[2]) / fl, 0, SHELL_C[1], 0, 0.95 - shrink, 1.06 - shrink, 1.0 - shrink) * fl;
}

const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// One layer of the bob: clumps around the head, each with its own depth and tip.
function hairLayer(x, y, z, L) {
  const th = Math.atan2(x, z - SHELL_C[2]);
  const g = th * L.count / TAU + L.phase + 0.22 * Math.sin(2 * th + 1) + 0.1 * Math.sin(5 * th + L.phase * 7);
  const ci = Math.round(g), f = g - ci;
  const r1 = hash1(ci + 31 * L.count), r2 = hash1(ci * 1.7 + 5 + L.count);
  // Asymmetric profile: rounded crest, crisp valley.
  const bump = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * f), 1.6)), 0.6);
  const depth = L.depth * (0.6 + 0.7 * r1) * smoothstep(0.95, 0.2, y);
  const base = shellBase(x, y, z, L.shrink);
  let d = base + depth * (1 - bump);
  const s = Math.sin(th);
  const yb = L.yb - L.side * s * s + 0.05 * Math.cos(th * 3) + (r2 - 0.5) * 0.08;
  d = smax(d, yb + L.tip * (0.7 + 0.5 * r2) * Math.pow(Math.abs(2 * f), 1.2) - y, 0.012);
  const t = mix(0.035, 0.09, smoothstep(-0.8, 0.4, y));
  d = smax(d, -(base + t + depth), 0.01);
  return d;
}

const LAYERS = [
  // Long under-layer.
  { shrink: 0.03, count: 19, phase: 0.5, depth: 0.045, yb: -0.68, side: 0.16, tip: 0.17 },
  // Shorter over-layer: breaks the silhouette into steps.
  { shrink: 0.0, count: 13, phase: 0.0, depth: 0.055, yb: -0.36, side: 0.2, tip: 0.2 },
];

function hairShell(x, y, z) {
  let d = Math.min(hairLayer(x, y, z, LAYERS[0]), hairLayer(x, y, z, LAYERS[1]));
  // Open the face below the hairline.
  d = smax(d, -ellipsoid(x, y, z, 0, -0.5, 0.92, 0.78, 1.1, 1.08), 0.05);
  return d;
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function gradOf(f, x, y, z) {
  const e = 1e-3;
  return norm3([f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]);
}

// What the clumps drape over.
function scalp(x, y, z) {
  return Math.min(skin(x, y, z), ellipsoid(x, y, z, 0, 0.14, -0.07, 0.83, 0.89, 0.89));
}

function resample(pts, n) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = acc[acc.length - 1], out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = L * i / n;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const t = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    out.push([0, 1, 2].map((k) => mix(pts[j][k], pts[j + 1][k], t)));
  }
  return out;
}

// Grow a clump: it slides over the scalp at a fixed clearance while above
// `hugAbove`, then falls freely (never entering the head).
function growStrand(o) {
  let dir = norm3([Math.sin(o.phi) * Math.cos(o.el), Math.sin(o.el), Math.cos(o.phi) * Math.cos(o.el)]);
  // Root on the offset surface along the ray from the skull centre.
  let lo = 0.2, hi = 1.6;
  const at = (r) => [dir[0] * r, 0.14 + dir[1] * r, -0.07 + dir[2] * r];
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (scalp(...at(m)) < o.clearance) lo = m; else hi = m; }
  let p = at(lo);
  let n = gradOf(scalp, ...p);
  let d = norm3([o.start[0] - n[0] * 0.1, o.start[1], o.start[2]]);
  const pts = [p.slice()];
  const ds = 0.02;
  for (let i = 0; i < 400 && p[1] > o.endY; i++) {
    const prev = p.slice();
    d = norm3([d[0] * 0.9 + o.bias[0] * 0.1, d[1] * 0.9 + (o.bias[1] - 1) * 0.1 * o.gravity, d[2] * 0.9 + o.bias[2] * 0.1]);
    p = [p[0] + d[0] * ds, p[1] + d[1] * ds, p[2] + d[2] * ds];
    for (let it = 0; it < 2; it++) {
      const s = scalp(...p);
      n = gradOf(scalp, ...p);
      const clear = o.clearance + (o.lift || 0) * Math.max(0, pts.length * ds - 0.3);
      if (p[1] > o.hugAbove || s < clear) {
        const k = s - clear;
        p = [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k];
      }
    }
    d = norm3([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]]);
    pts.push(p.slice());
  }
  const path = resample(pts, 26);
  const m = path.length;
  const nodes = path.map((q, i) => {
    const t = i / (m - 1);
    const prof = (t < 0.08 ? 0.75 + 0.25 * t / 0.08 : 1) *
      (t < o.taper ? 1 : Math.pow(Math.cos((t - o.taper) / (1 - o.taper) * Math.PI / 2), 0.9));
    const w = Math.max(0.002, o.width * prof);
    return { p: q, n: gradOf(scalp, ...q), w, th: Math.max(0.002, Math.min(w * 0.9, o.width * o.flat)) };
  });
  // Smooth the flattening axis along the clump so it never twists.
  const raw = nodes.map((q) => q.n);
  nodes.forEach((q, i) => {
    let a = [0, 0, 0];
    for (let k = -5; k <= 5; k++) { const r = raw[clamp(i + k, 0, m - 1)]; a = [a[0] + r[0], a[1] + r[1], a[2] + r[2]]; }
    const nb = path[Math.min(m - 1, i + 1)], pb = path[Math.max(0, i - 1)];
    const tg = norm3([nb[0] - pb[0], nb[1] - pb[1], nb[2] - pb[2]]);
    const dt = a[0] * tg[0] + a[1] * tg[1] + a[2] * tg[2];
    q.n = norm3([a[0] - dt * tg[0], a[1] - dt * tg[1], a[2] - dt * tg[2]]);
  });
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const q of nodes) for (let k = 0; k < 3; k++) {
    box[k] = Math.min(box[k], q.p[k] - q.w - 0.05);
    box[k + 3] = Math.max(box[k + 3], q.p[k] + q.w + 0.05);
  }
  const segs = [];
  for (let i = 0; i + 1 < m; i++) segs.push([nodes[i], nodes[i + 1]]);
  return { segs, box };
}

function makeStrands() {
  const deg = Math.PI / 180;
  const list = [];
  // Bangs: from the crown, over the forehead, uneven pointed tips.
  const bangs = [
    [-52, 0.14, 0.13], [-38, 0.02, 0.14], [-24, 0.12, 0.13], [-12, -0.02, 0.13], [0, 0.08, 0.12],
    [11, -0.06, 0.13], [23, 0.1, 0.13], [36, 0.0, 0.14], [50, 0.12, 0.13],
  ];
  for (const [a, endY, w] of bangs) {
    const phi = a * deg;
    list.push({
      phi, el: 58 * deg, start: [Math.sin(phi) * 0.25, -0.2, 1], bias: [Math.sin(phi) * 0.35, 0, 0.1],
      gravity: 1, clearance: 0.05, lift: 0.03, hugAbove: -9, endY, width: w, flat: 0.32, taper: 0.45,
    });
  }
  // Side locks framing the face.
  for (const s of [-1, 1]) {
    list.push({
      phi: s * 62 * deg, el: 30 * deg, start: [s * 0.1, -1, 0.15], bias: [0, 0, 0.1],
      gravity: 1, clearance: 0.05, hugAbove: -0.25, endY: -0.98, width: 0.12, flat: 0.35, taper: 0.5,
    });
    list.push({
      phi: s * 72 * deg, el: 30 * deg, start: [s * 0.2, -1, 0.05], bias: [s * 0.05, 0, 0],
      gravity: 1, clearance: 0.07, hugAbove: -0.3, endY: -0.86, width: 0.13, flat: 0.35, taper: 0.5,
    });
  }
  const strands = list.map(growStrand);

  // Ahoge: one flat, springy lock arcing up and forward from the crown.
  const nodes = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = 1.9 - 2.6 * t;
    nodes.push({
      p: [0.02 + 0.08 * t, 1.1 + 0.34 * Math.sin(ang) * t + 0.14 * t, 0.0 + 0.3 * t + 0.1 * Math.cos(ang) * t],
      n: norm3([1, 0, 0]), w: Math.max(0.002, 0.07 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t)), 0.8)),
      th: 0.03 * (1 - t) + 0.004,
    });
  }
  const segs = [];
  for (let i = 0; i < nodes.length - 1; i++) segs.push([nodes[i], nodes[i + 1]]);
  strands.push({ segs, box: [-0.2, 0.95, -0.2, 0.35, 1.7, 0.55] });
  return strands;
}

// Flattened clump segment: elliptical cross-section, thin along the scalp normal.
function segDist(x, y, z, a, b) {
  const bax = b.p[0] - a.p[0], bay = b.p[1] - a.p[1], baz = b.p[2] - a.p[2];
  const pax = x - a.p[0], pay = y - a.p[1], paz = z - a.p[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz + 1e-12), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  const nx = mix(a.n[0], b.n[0], h), ny = mix(a.n[1], b.n[1], h), nz = mix(a.n[2], b.n[2], h);
  const nl = Math.hypot(nx, ny, nz) || 1;
  const dn = (dx * nx + dy * ny + dz * nz) / nl;
  const dp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - dn * dn));
  const w = mix(a.w, b.w, h), th = mix(a.th, b.th, h);
  const k = Math.sqrt((dn / th) ** 2 + (dp / w) ** 2);
  return (k - 1) * Math.min(w, th) * (k < 1 ? 1 : Math.min(4, 0.5 + 0.5 * k));
}

function makeHair(strands) {
  return function hair(x, y, z) {
    let d = hairShell(x, y, z);
    for (let s = 0; s < strands.length; s++) {
      const S = strands[s], b = S.box;
      if (x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) continue;
      let sd = Infinity;
      for (let i = 0; i < S.segs.length; i++) {
        const v = segDist(x, y, z, S.segs[i][0], S.segs[i][1]);
        if (v < sd) sd = v;
      }
      d = smin(d, sd, 0.03);
    }
    return d;
  };
}

module.exports = { skin, makeStrands, makeHair };
