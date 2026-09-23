// Bust: loose hoodie torso, bunched hood around the neck, drawstrings and
// backpack straps. Torso is a relaxed quad grid; the rest are swept tubes.
'use strict';
const { smin, smax, ellipsoid, capsule, clamp, mix, smoothstep } = require('./sdf');
const { skin } = require('./head');
const { torsoGrid, gradient, project, outerHit } = require('./topo');

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const deg = Math.PI / 180;

const LIFT = 0.27;            // raise the shoulders: short anime neck
const BOTTOM = -2.75 + LIFT;

function torso(x, y, z) {
  const ax = Math.abs(x);
  const yy = y - LIFT;
  // Soft, oversized hoodie: sloping shoulders + roomy chest + snug collar.
  let d = capsule(ax, yy, z, 0, -1.66, -0.27, 0.96, -1.92, -0.3, 0.36, 0.4);
  d = smin(d, ellipsoid(x, yy, z, 0, -2.38, -0.24, 1.2, 1.02, 0.74), 0.32);
  d = smin(d, capsule(x, y, z, 0, -1.4, -0.26, 0, -1.95 + LIFT, -0.25, 0.35, 0.44), 0.16);
  d = smax(d, BOTTOM - y, 0.03);
  return d;
}

const bodySurf = (x, y, z) => Math.min(torso(x, y, z), skin(x, y, z));

// ------------------------------------------------------------- sweeps ----
// Sweep an elliptical section along a polyline. `upHint(p)` gives the
// direction of the section's thin axis (usually the surface normal).
function sweep(pts, wOf, tOf, upHint, K = 10) {
  const N = pts.length - 1;
  const rings = [];
  const nodes = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const tg = norm([0, 1, 2].map((k) => pts[Math.min(N, i + 1)][k] - pts[Math.max(0, i - 1)][k]));
    let up = upHint(pts[i], i);
    up = norm(add(up, tg, -dot(up, tg)));
    const b = norm(cross(tg, up));
    const w = wOf(t), th = tOf(t);
    const ring = [];
    for (let k = 0; k < K; k++) {
      const a = k / K * 2 * Math.PI;
      ring.push(add(add(pts[i], b, w * Math.cos(a)), up, th * Math.sin(a)));
    }
    rings.push(ring);
    nodes.push({ p: pts[i], n: up, w, th });
  }
  return { rings, nodes };
}

function smoothPath(pts, iters = 3) {
  let P = pts.map((p) => p.slice());
  for (let it = 0; it < iters; it++) {
    P = P.map((p, i) => (i === 0 || i === P.length - 1 ? p : [0, 1, 2].map((k) => (P[i - 1][k] + 2 * p[k] + P[i + 1][k]) / 4)));
  }
  return P;
}

// Hood bunched around the back of the neck, thinning toward the front.
function buildHood() {
  const pts = [];
  const M = 40;
  for (let i = 0; i <= M; i++) {
    const u = i / M * 2 - 1; // -1..1, 0 = back
    const a = u * 148 * deg;
    const back = Math.cos(a);
    const R = mix(0.42, 0.6, (back + 1) / 2);
    let p = [Math.sin(a) * R, mix(-1.5, -1.12, Math.pow((back + 1) / 2, 1.4)) + 0.1, -0.24 - back * R];
    pts.push(p);
  }
  const radius = (t) => { const back = Math.cos((t * 2 - 1) * 148 * deg); return mix(0.12, 0.36, Math.pow((back + 1) / 2, 1.2)); };
  // Rest the hood on the shoulders/collar.
  const path = smoothPath(pts.map((p, i) => {
    const r = radius(i / M);
    for (let k = 0; k < 6; k++) {
      const s = bodySurf(...p);
      if (s < r * 0.75) p = add(p, gradient(bodySurf, ...p), r * 0.75 - s);
    }
    return p;
  }), 4);
  return sweep(path, (t) => radius(t) * 1.1, (t) => radius(t) * 0.8, (p) => gradient(bodySurf, ...p), 14);
}

// Drawstrings hanging from the front of the collar, resting on the chest.
function buildStrings() {
  const out = [];
  for (const s of [-1, 1]) {
    const pts = [];
    const M = 24;
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      const y = mix(-1.38, -2.1 - (s > 0 ? 0.06 : 0), t);
      const x = s * (0.13 + 0.05 * t);
      const hit = outerHit(torso, [x, y, -0.25], [0, 0, 1]);
      pts.push([hit[0], hit[1], hit[2] + 0.028]);
    }
    const path = smoothPath(pts, 2);
    out.push(sweep(path, (t) => (t > 0.9 ? 0.028 : 0.018), (t) => (t > 0.9 ? 0.028 : 0.018), (p) => [0, 0, 1], 8));
  }
  return out;
}

// Backpack straps over the shoulders, with a slider on the front.
function buildStraps() {
  const out = [];
  for (const s of [-1, 1]) {
    const O = [s * 0.66, -1.98 + LIFT, -0.26];
    const pts = [];
    const M = 44;
    for (let i = 0; i <= M; i++) {
      const b = mix(-118, 146, i / M) * deg;
      const hit = outerHit(torso, O, [s * 0.05 * Math.sin(b), Math.cos(b), Math.sin(b)]);
      pts.push(hit);
    }
    const path = smoothPath(pts, 3).map((p) => add(p, gradient(torso, ...p), 0.03));
    const up = (p) => gradient(torso, ...p);
    out.push({ kind: 'strap', ...sweep(path, () => 0.105, () => 0.022, up, 12) });
    // Slider: a short, slightly wider/thicker band on the front of the strap.
    const j = Math.round(M * 0.78);
    const seg = path.slice(j - 2, j + 3).map((p) => add(p, gradient(torso, ...p), 0.01));
    out.push({ kind: 'buckle', ...sweep(seg, () => 0.125, () => 0.03, up, 12) });
  }
  return out;
}

// ------------------------------------------------------------ assembly ----
function buildBody() {
  const torsoMesh = torsoGrid(torso, { bottomY: BOTTOM });
  const hood = buildHood();
  const strings = buildStrings();
  const straps = buildStraps();

  // Hoodie mesh = torso grid (UV left 72%) + hood tube (right strip).
  const hoodie = { positions: [], normals: [], uvs: [], indices: [], part: [] };
  const Pt = torsoMesh.positions;
  for (let i = 0; i < Pt.length / 3; i++) {
    hoodie.positions.push(Pt[3 * i], Pt[3 * i + 1], Pt[3 * i + 2]);
    hoodie.normals.push(torsoMesh.normals[3 * i], torsoMesh.normals[3 * i + 1], torsoMesh.normals[3 * i + 2]);
    hoodie.uvs.push(torsoMesh.uvs[2 * i] * 0.72, torsoMesh.uvs[2 * i + 1]);
    hoodie.part.push(0);
  }
  hoodie.indices.push(...torsoMesh.indices);
  appendTube(hoodie, hood.rings, [0.73, 0, 0.27, 1], 1, true);

  const acc = { positions: [], normals: [], uvs: [], indices: [], part: [] };
  const cells = [...straps.map((s) => [s.rings, s.kind === 'strap' ? 2 : 3]), ...strings.map((s) => [s.rings, 4])];
  cells.forEach(([rings, part], i) => appendTube(acc, rings, [i / cells.length, 0, 1 / cells.length, 1], part, true));

  const finish = (m) => {
    const P = new Float32Array(m.positions), I = new Uint32Array(m.indices);
    const N = m.normals.length === m.positions.length ? new Float32Array(m.normals) : null;
    return { positions: P, normals: N || recomputeNormals(P, I), uvs: new Float32Array(m.uvs), indices: I, part: new Float32Array(m.part) };
  };
  const hoodieMesh = finish(hoodie);
  hoodieMesh.normals.set(torsoMesh.normals, 0); // smooth SDF normals on the torso

  // Approximate SDF of everything for AO.
  const tubes = [hood.nodes, ...strings.map((s) => s.nodes), ...straps.map((s) => s.nodes)];
  const segs = [];
  for (const nodes of tubes) for (let i = 0; i + 1 < nodes.length; i++) segs.push([nodes[i], nodes[i + 1]]);
  const sdf = (x, y, z) => {
    let d = torso(x, y, z);
    for (const [a, b] of segs) {
      const r = Math.max(a.w, a.th, b.w, b.th);
      const v = capsule(x, y, z, ...a.p, ...b.p, Math.min(a.w, a.th) + 0.3 * r, Math.min(b.w, b.th) + 0.3 * r);
      if (v < d) d = v;
    }
    return d;
  };
  return { hoodie: hoodieMesh, acc: finish(acc), sdf };
}

function appendTube(m, rings, [u0, v0, uw, vh], part, caps) {
  const base = m.positions.length / 3, K = rings[0].length, Nr = rings.length, W = K + 1;
  const pad = 0.004;
  for (let i = 0; i < Nr; i++) for (let k = 0; k <= K; k++) {
    m.positions.push(...rings[i][k % K]);
    m.uvs.push(u0 + pad + (uw - 2 * pad) * k / K, v0 + pad + (vh - 2 * pad) * i / (Nr - 1));
    m.part.push(part);
  }
  const i0 = m.indices.length;
  for (let i = 0; i + 1 < Nr; i++) for (let k = 0; k < K; k++) {
    const a = base + i * W + k, b = a + 1, c = a + W + 1, d = a + W;
    m.indices.push(a, b, c, a, c, d);
  }
  if (caps) for (const [i, flip] of [[0, true], [Nr - 1, false]]) {
    const ctr = [0, 0, 0];
    for (const q of rings[i]) for (let k = 0; k < 3; k++) ctr[k] += q[k] / K;
    const ci = m.positions.length / 3;
    m.positions.push(...ctr); m.uvs.push(u0 + uw / 2, v0 + pad + (vh - 2 * pad) * i / (Nr - 1)); m.part.push(part);
    for (let k = 0; k < K; k++) {
      const a = base + i * W + k, b = a + 1;
      if (flip) m.indices.push(ci, b, a); else m.indices.push(ci, a, b);
    }
  }
  // Outward winding check on the middle ring.
  const mid = Math.floor(Nr / 2), ctr = [0, 0, 0];
  for (const q of rings[mid]) for (let k = 0; k < 3; k++) ctr[k] += q[k] / K;
  const P3 = (j) => m.positions.slice(3 * j, 3 * j + 3);
  let score = 0;
  for (let k = 0; k < K; k++) {
    const a = base + mid * W + k, pa = P3(a), pb = P3(a + 1), pd = P3(a + W);
    const n = cross([0, 1, 2].map((q) => pb[q] - pa[q]), [0, 1, 2].map((q) => pd[q] - pa[q]));
    score += dot(n, [pa[0] - ctr[0], pa[1] - ctr[1], pa[2] - ctr[2]]);
  }
  if (score < 0) for (let j = i0; j < m.indices.length; j += 3) { const t = m.indices[j + 1]; m.indices[j + 1] = m.indices[j + 2]; m.indices[j + 2] = t; }
}

function recomputeNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
    for (const j of [a, b, c]) { N[j] += n[0]; N[j + 1] += n[1]; N[j + 2] += n[2]; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

module.exports = { buildBody, torso };
