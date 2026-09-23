// Game-style anime hair: explicit ribbon clumps (clean quad strips) grown from
// a crown whorl so they part naturally, drape over the skull and curl inward
// at the ends, plus a scalp cap underneath so no gaps show.
'use strict';
const { skin } = require('./head');
const { ellipsoid, clamp, mix, smoothstep } = require('./sdf');
const { gradient, project } = require('./topo');

const deg = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// Surface the hair rests on: skull slightly padded.
const SKULL = [0, 0.12, -0.08];
function scalp(x, y, z) {
  return Math.min(skin(x, y, z), ellipsoid(x, y, z, SKULL[0], SKULL[1], SKULL[2], 0.855, 0.895, 0.895));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scalpPoint(dir, clearance) {
  let lo = 0.1, hi = 1.8;
  const at = (r) => [SKULL[0] + dir[0] * r, SKULL[1] + dir[1] * r, SKULL[2] + dir[2] * r];
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (scalp(...at(m)) < clearance) lo = m; else hi = m; }
  return at(lo);
}

// Walk over the scalp: momentum + growing gravity, kept at `clearance` above
// the surface while above `hugAbove`, then free (but never inside the head).
function growPath(o) {
  let p = o.root.slice();
  let n = gradient(scalp, ...p);
  let d = norm(add(o.dir, n, -dot(o.dir, n)));
  const pts = [p.slice()];
  const ds = 0.015;
  let len = 0;
  for (let i = 0; i < 600; i++) {
    const g = o.gravity * Math.min(1, Math.pow(len / o.stiff, 2));
    let want = add(d, [0, -1, 0], g);
    // Inward curl for bob ends (toward the neck axis) once low enough.
    if (o.curl && p[1] < o.curlBelow) {
      const k = o.curl * smoothstep(o.curlBelow, o.endY, p[1]);
      want = add(want, norm([-p[0], 0.25, -(p[2] + 0.2)]), k);
    }
    d = norm(add(d, norm(want), 0.25));
    const prev = p.slice();
    p = add(p, d, ds);
    const clear = o.clearance + (o.lift || 0) * len;
    for (let k = 0; k < 2; k++) {
      const s = scalp(...p);
      if (p[1] > o.hugAbove || s < clear) {
        n = gradient(scalp, ...p);
        p = add(p, n, clear - s);
      }
    }
    d = norm([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]]);
    len += ds;
    pts.push(p.slice());
    if (p[1] < o.endY || len > o.maxLen) break;
  }
  return pts;
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
  return { pts: out, length: L };
}

// Width profile: narrow root, full body, sharp point.
function profile(t, taper) {
  const root = 0.55 + 0.45 * smoothstep(0, 0.18, t);
  const tip = t < taper ? 1 : Math.pow(Math.cos((t - taper) / (1 - taper) * Math.PI / 2), 0.85);
  return root * tip;
}

function strandSpecs(seed = 3) {
  const R = rng(seed);
  const specs = [];
  const whorlDir = norm([0, 0.94, -0.34]);
  const base = { gravity: 1.2, stiff: 0.9, hugAbove: -0.35, clearance: 0.04, lift: 0, curl: 0, curlBelow: -0.4, taper: 0.55, flat: 0.28, droop: 0.35, maxLen: 4 };

  // Direction on the scalp at the whorl for a given azimuth (0 = toward the face).
  const W = scalpPoint(whorlDir, 0.03);
  const nW = gradient(scalp, ...W);
  const fwd = norm(add([0, 0, 1], nW, -dot([0, 0, 1], nW)));
  const side = cross(nW, fwd);
  const at = (az) => norm(add([fwd[0] * Math.cos(az), fwd[1] * Math.cos(az), fwd[2] * Math.cos(az)], side, -Math.sin(az)));
  const rootNear = (az, r) => project(scalp, add(W, at(az), r)).map((v, i) => v + nW[i] * 0.02);

  // Bangs: broad clumps from the whorl over the top, ending just above the eyes.
  const bangs = [
    [-46, 0.02, 0.27], [-33, -0.06, 0.27], [-20, 0.05, 0.26], [-8, -0.1, 0.27], [4, -0.02, 0.26],
    [16, -0.09, 0.27], [29, 0.04, 0.26], [42, -0.04, 0.27],
  ];
  for (const [a, endY, w] of bangs) {
    const az = a * deg;
    specs.push(Object.assign({}, base, {
      kind: 'bang', root: rootNear(az, 0.05), dir: at(az), width: w + R() * 0.02, endY,
      gravity: 0.5, stiff: 1.6, hugAbove: -9, clearance: 0.035, lift: 0.014, taper: 0.72, flat: 0.2,
    }));
  }
  // Temple fillers between bangs and bob.
  for (const s of [-1, 1]) for (const [a, endY, cl] of [[52, -0.3, 0.05], [62, -0.55, 0.075]]) {
    const az = s * a * deg;
    specs.push(Object.assign({}, base, {
      kind: 'side', root: rootNear(az, 0.04), dir: at(az), width: 0.3, endY,
      gravity: 0.9, stiff: 1.1, hugAbove: -0.4, clearance: cl, lift: 0.01, taper: 0.7, flat: 0.2,
    }));
  }
  // Side locks framing the face.
  for (const s of [-1, 1]) {
    for (const [dx, endY, w, cl] of [[0.0, -1.0, 0.24, 0.05], [0.1, -0.88, 0.24, 0.075]]) {
      const root = scalpPoint(norm([s * (0.8 - dx), 0.45, 0.42 - dx]), 0.04);
      specs.push(Object.assign({}, base, {
        kind: 'side', root, dir: [0, -1, 0.15], width: w, endY, gravity: 1.5, stiff: 0.2,
        hugAbove: -0.45, clearance: cl, taper: 0.62, flat: 0.22,
      }));
    }
  }
  // Bob: two layers radiating from the whorl, broad clumps whose ends tuck in.
  for (let a = 66; a <= 294; a += 16) {
    const az = (a + (R() - 0.5) * 4) * deg;
    const back = -Math.cos(az);
    specs.push(Object.assign({}, base, {
      kind: 'bob', root: rootNear(az, 0.04), dir: at(az), width: 0.33 + R() * 0.03,
      endY: -0.74 - 0.06 * (1 - back) + (R() - 0.5) * 0.05, clearance: 0.05, lift: 0.01,
      curl: 1.4 * (0.25 + 0.75 * (back + 1) / 2), curlBelow: -0.3, taper: 0.76, stiff: 0.7, flat: 0.2,
    }));
  }
  for (let a = 74; a <= 290; a += 18) {
    const az = (a + (R() - 0.5) * 5) * deg;
    const back = -Math.cos(az);
    specs.push(Object.assign({}, base, {
      kind: 'bob', root: rootNear(az, 0.02), dir: at(az), width: 0.34 + R() * 0.03,
      endY: -0.6 - 0.05 * (1 - back) + (R() - 0.5) * 0.06, clearance: 0.1, lift: 0.012,
      curl: 1.5 * (0.25 + 0.75 * (back + 1) / 2), curlBelow: -0.2, taper: 0.74, stiff: 0.7, flat: 0.2,
    }));
  }
  return specs;
}

// Build one clump as a closed lens-shaped tube: K verts around, N+1 rings.
function buildStrand(spec, N = 22, K = 10) {
  const { pts, length } = resample(growPath(spec), N);
  // Stable frames: scalp normal smoothed along the path, orthogonal to tangent.
  const tangents = pts.map((_, i) => norm([0, 1, 2].map((k) => pts[Math.min(N, i + 1)][k] - pts[Math.max(0, i - 1)][k])));
  const rawN = pts.map((p) => gradient(scalp, ...p));
  const frames = pts.map((p, i) => {
    let a = [0, 0, 0];
    for (let k = -4; k <= 4; k++) a = add(a, rawN[clamp(i + k, 0, N)]);
    const t = tangents[i];
    const nrm = norm(add(a, t, -dot(a, t)));
    return { t, n: nrm, b: norm(cross(t, nrm)) };
  });
  const rings = [];
  const nodes = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = spec.width * profile(t, spec.taper) * 0.5;
    const th = Math.max(0.004, spec.width * spec.flat * 0.5 * Math.min(1, profile(t, spec.taper) * 1.4));
    const { n, b } = frames[i];
    const c = add(pts[i], n, th * 0.6);
    const ring = [];
    for (let k = 0; k < K; k++) {
      const a = k / K * 2 * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Lens section whose edges droop toward the scalp (shingled look).
      const off = th * sa - spec.droop * w * ca * ca * 0.5;
      ring.push(add(add(c, b, w * ca), n, off));
    }
    rings.push(ring);
    nodes.push({ p: c, n, w: Math.max(w, 0.002), th: Math.max(th, 0.002) });
  }
  return { rings, nodes, length, kind: spec.kind };
}

// Scalp cap under the hair (hemisphere-ish grid on the padded skull).
function buildCap(cols = 48, rows = 18) {
  const rings = [];
  for (let r = 0; r <= rows; r++) {
    const ring = [];
    for (let c = 0; c < cols; c++) {
      const th = c / cols * 2 * Math.PI;
      // Lower edge: forehead hairline high, nape low.
      const back = -Math.cos(th);
      const elMin = mix(32, -34, Math.sqrt((back + 1) / 2)) * deg;
      const el = mix(88 * deg, elMin, r / rows);
      const dir = [Math.cos(el) * Math.sin(th), Math.sin(el), Math.cos(el) * Math.cos(th)];
      ring.push(scalpPoint(dir, 0.012));
    }
    rings.push(ring);
  }
  return rings;
}

/** Assemble all hair geometry into one mesh with a UV atlas (one island per clump). */
function buildHair(seed = 3) {
  const strands = strandSpecs(seed).map((s) => buildStrand(s));
  const cap = buildCap();
  const positions = [], uvs = [], indices = [];
  const attrT = [], attrA = [], attrId = [];
  // Atlas: cap gets the left strip, clumps fill a grid of tall cells.
  const cols = 12, rowsA = Math.ceil(strands.length / cols);
  const capW = 0.14, pad = 0.004;
  const cellW = (1 - capW) / cols, cellH = 1 / rowsA;

  const pushGrid = (rings, closed, u0, v0, uw, vh, id, tip) => {
    const base = positions.length / 3, i0 = indices.length;
    const K = rings[0].length, Nr = rings.length;
    for (let i = 0; i < Nr; i++) for (let k = 0; k <= K; k++) {
      const p = rings[i][k % K];
      positions.push(...p);
      uvs.push(u0 + pad + (uw - 2 * pad) * k / K, v0 + pad + (vh - 2 * pad) * i / (Nr - 1));
      attrT.push(i / (Nr - 1)); attrA.push(k / K); attrId.push(id);
    }
    const W = K + 1;
    for (let i = 0; i + 1 < Nr; i++) for (let k = 0; k < K; k++) {
      if (!closed && k === K - 1) continue;
      const a = base + i * W + k, b = base + i * W + k + 1, c = base + (i + 1) * W + k + 1, d = base + (i + 1) * W + k;
      indices.push(a, b, c, a, c, d);
    }
    if (tip) { // close both ends with a fan to the ring centroid
      for (const [i, flip] of [[0, true], [Nr - 1, false]]) {
        const ctr = [0, 0, 0];
        for (const q of rings[i]) { ctr[0] += q[0] / K; ctr[1] += q[1] / K; ctr[2] += q[2] / K; }
        const ci = positions.length / 3;
        positions.push(...ctr);
        uvs.push(u0 + uw / 2, v0 + pad + (vh - 2 * pad) * i / (Nr - 1));
        attrT.push(i / (Nr - 1)); attrA.push(0.25); attrId.push(id);
        for (let k = 0; k < K; k++) {
          const a = base + i * W + k, b = base + i * W + k + 1;
          if (flip) indices.push(ci, b, a); else indices.push(ci, a, b);
        }
      }
    }
    // Make the winding face outward (away from each ring's centre).
    let score = 0;
    const mid = Math.floor(Nr / 2);
    const ctr = [0, 0, 0];
    for (const q of rings[mid]) { ctr[0] += q[0] / K; ctr[1] += q[1] / K; ctr[2] += q[2] / K; }
    for (let k = 0; k < K; k++) {
      const a = base + mid * W + k, b = base + mid * W + k + 1, d = base + (mid + 1) * W + k;
      const P3 = (j) => positions.slice(3 * j, 3 * j + 3);
      const pa = P3(a), n = cross([0, 1, 2].map((m) => P3(b)[m] - pa[m]), [0, 1, 2].map((m) => P3(d)[m] - pa[m]));
      score += dot(n, [pa[0] - ctr[0], pa[1] - ctr[1], pa[2] - ctr[2]]);
    }
    if (score < 0) for (let j = i0; j < indices.length; j += 3) { const t = indices[j + 1]; indices[j + 1] = indices[j + 2]; indices[j + 2] = t; }
  };
  pushGrid(cap, true, 0, 0, capW, 1, -1, false);
  strands.forEach((s, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    pushGrid(s.rings, true, capW + cx * cellW, cy * cellH, cellW, cellH, i, true);
  });

  const P = new Float32Array(positions), I = new Uint32Array(indices);
  // Orientation fix-up for the cap (its rings run top->bottom, same as clumps).
  const normals = vertexNormals(P, I);
  // SDF of the clumps (for AO): flattened elliptical tubes along the nodes.
  const hairSDF = makeStrandSDF(strands);
  return {
    positions: P, normals, uvs: new Float32Array(uvs), indices: I,
    attrs: { t: new Float32Array(attrT), a: new Float32Array(attrA), id: new Float32Array(attrId) },
    strands, sdf: hairSDF,
  };
}

function vertexNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = cross(u, v);
    for (const j of [a, b, c]) { N[j] += n[0]; N[j + 1] += n[1]; N[j + 2] += n[2]; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  return N;
}

function makeStrandSDF(strands) {
  const segs = [];
  for (const s of strands) for (let i = 0; i + 1 < s.nodes.length; i++) {
    const a = s.nodes[i], b = s.nodes[i + 1];
    const r = Math.max(a.w, b.w) + 0.02;
    segs.push({ a, b, box: [0, 1, 2].map((k) => Math.min(a.p[k], b.p[k]) - r).concat([0, 1, 2].map((k) => Math.max(a.p[k], b.p[k]) + r)) });
  }
  const capSdf = (x, y, z) => {
    const d = scalp(x, y, z) - 0.012;
    // Only where the cap exists (above the hairline).
    const th = Math.atan2(x, z - SKULL[2]);
    const el = Math.atan2(y - SKULL[1], Math.hypot(x, z - SKULL[2]));
    const elMin = mix(32, -34, Math.sqrt((1 - Math.cos(th)) / 2)) * deg;
    return Math.max(d, (elMin - el) * 0.8);
  };
  return function (x, y, z) {
    let d = capSdf(x, y, z);
    for (const s of segs) {
      const b = s.box;
      if (x < b[0] || y < b[1] || z < b[2] || x > b[3] || y > b[4] || z > b[5]) continue;
      const { a, b: e } = s;
      const bax = e.p[0] - a.p[0], bay = e.p[1] - a.p[1], baz = e.p[2] - a.p[2];
      const pax = x - a.p[0], pay = y - a.p[1], paz = z - a.p[2];
      const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz + 1e-12), 0, 1);
      const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
      const n = [mix(a.n[0], e.n[0], h), mix(a.n[1], e.n[1], h), mix(a.n[2], e.n[2], h)];
      const nl = Math.hypot(...n) || 1;
      const dn = (dx * n[0] + dy * n[1] + dz * n[2]) / nl;
      const dp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - dn * dn));
      const w = mix(a.w, e.w, h), th = mix(a.th, e.th, h);
      const k = Math.sqrt((dn / th) ** 2 + (dp / w) ** 2);
      const v = (k - 1) * Math.min(w, th) * (k < 1 ? 1 : Math.min(4, 0.5 + 0.5 * k));
      if (v < d) d = v;
    }
    return d;
  };
}

module.exports = { buildHair, scalp };
