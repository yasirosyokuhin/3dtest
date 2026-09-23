// Procedural "hand painted" albedo textures in the cylindrical UV layout.
// Facial features are authored in front-view coordinates (X, Y) and projected
// onto the actual sculpted surface, so they stay undistorted from the front.
'use strict';
const { uToTheta, vToY } = require('./uv');
const { clamp, mix, smoothstep } = require('./sdf');

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const DEFAULT_PALETTE = {
  skin: '#ffe8dc', skinShade: '#f6c9bd', blush: '#ff8f9f',
  irisTop: '#1b2250', irisMid: '#2f6fb8', irisBottom: '#6fd3f5', irisGlow: '#c8f6ff', pupil: '#0d1030',
  sclera: '#fffdfd', scleraShade: '#b9bfe3', lash: '#2a1714', lowerLash: '#7a4038', crease: '#c98e84',
  brow: '#5a3328', mouth: '#a8434e', nose: '#e59c90',
  hairDark: '#2f1b1a', hair: '#6a3f33', hairLight: '#a9705c', hairShine: '#f2cdb6',
};

function blend(c, col, a) {
  if (a <= 0) return;
  c[0] += (col[0] - c[0]) * a; c[1] += (col[1] - c[1]) * a; c[2] += (col[2] - c[2]) * a;
}

// Distance to a polyline with per-point radius (negative inside the stroke).
function strokeDist(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay, ar] = pts[i], [bx, by, br] = pts[i + 1];
    const bax = bx - ax, bay = by - ay;
    const h = clamp(((x - ax) * bax + (y - ay) * bay) / (bax * bax + bay * bay), 0, 1);
    const d = Math.hypot(x - ax - bax * h, y - ay - bay * h) - mix(ar, br, h);
    if (d < best) best = d;
  }
  return best;
}

// ------------------------------------------------------------ eye shape ----
const EYE = { xi: 0.125, xo: 0.49, irisX: 0.312, irisY: -0.13, irisRX: 0.097, irisRY: 0.14 };

function upperLid(t) {
  t = clamp(t, 0, 1);
  return mix(-0.12, -0.08, t) + 0.155 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7);
}
function lowerLid(t) {
  t = clamp(t, 0, 1);
  return mix(-0.165, -0.125, t) - 0.165 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.1)), 0.9);
}
const eyeT = (ex) => (ex - EYE.xi) / (EYE.xo - EYE.xi);
const eyeX = (t) => EYE.xi + t * (EYE.xo - EYE.xi);

function buildEyeStrokes() {
  const lash = [];
  for (let i = 0; i <= 24; i++) {
    const t = -0.03 + i / 24 * 1.03;
    const r = 0.006 + 0.014 * Math.pow(clamp(t, 0, 1), 0.8);
    lash.push([eyeX(t), upperLid(t) + r * 0.75, r]);
  }
  const yEnd = upperLid(1);
  lash.push([EYE.xo + 0.025, yEnd - 0.012, 0.014], [EYE.xo + 0.055, yEnd - 0.05, 0.004]);
  // Two small lash flicks at the outer corner.
  const flickA = [[eyeX(0.86), upperLid(0.86) + 0.02, 0.01], [eyeX(0.95) + 0.03, upperLid(0.86) + 0.055, 0.002]];
  const flickB = [[eyeX(0.95), upperLid(0.95) + 0.015, 0.009], [EYE.xo + 0.05, upperLid(0.95) + 0.03, 0.002]];

  const lower = [];
  for (let i = 0; i <= 12; i++) {
    const t = 0.5 + i / 12 * 0.5;
    lower.push([eyeX(t), lowerLid(t) - 0.004, 0.0015 + 0.0035 * Math.sin(Math.PI * (t - 0.5) * 1.6)]);
  }
  const crease = [];
  for (let i = 0; i <= 12; i++) {
    const t = 0.28 + i / 12 * 0.7;
    crease.push([eyeX(t) + 0.01, upperLid(t) + 0.055 + 0.01 * t, 0.0022 * Math.sin(Math.PI * (i / 12)) + 0.0006]);
  }
  const brow = [[0.13, 0.215, 0.006], [0.2, 0.245, 0.011], [0.31, 0.255, 0.01], [0.44, 0.225, 0.006], [0.49, 0.2, 0.002]];
  return { lash, flickA, flickB, lower, crease, brow };
}

function paintEye(c, X, Y, pal, S, aa) {
  const side = X < 0 ? -1 : 1;
  const ex = Math.abs(X);
  if (ex < 0.05 || ex > 0.6 || Y < -0.4 || Y > 0.32) return;
  const cov = (d) => clamp(0.5 - d / aa, 0, 1);

  const t = eyeT(ex);
  const yU = upperLid(t), yL = lowerLid(t);
  const open = Math.max(Y - yU, yL - Y, EYE.xi - ex, ex - EYE.xo);

  // Brow and crease first (they sit under the lash line).
  blend(c, pal.brow, cov(strokeDist(ex, Y, S.brow)) * 0.95);
  blend(c, pal.crease, cov(strokeDist(ex, Y, S.crease)) * 0.8);
  // Soft eyelid shading above the lash line.
  blend(c, pal.skinShade, smoothstep(0.07, 0.0, Y - yU) * (Y > yU ? 1 : 0) * smoothstep(-0.02, 0.1, t) * smoothstep(1.05, 0.8, t) * 0.35);

  const inside = cov(open);
  if (inside > 0) {
    const e = [0, 0, 0];
    // Sclera with the upper lid's cast shadow.
    e[0] = pal.sclera[0]; e[1] = pal.sclera[1]; e[2] = pal.sclera[2];
    blend(e, pal.scleraShade, smoothstep(0.09, 0.0, yU - Y) * 0.8);

    // Iris (not mirrored: both highlights point to the same light).
    const ix = (ex - EYE.irisX) / EYE.irisRX, iy = (Y - EYE.irisY) / EYE.irisRY;
    const q = Math.hypot(ix, iy);
    const icov = cov((q - 1) * EYE.irisRX);
    if (icov > 0) {
      const g = clamp((iy + 1) / 2, 0, 1); // 0 bottom .. 1 top
      const ir = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        ir[k] = g > 0.5 ? mix(pal.irisMid[k], pal.irisTop[k], (g - 0.5) * 2) : mix(pal.irisBottom[k], pal.irisMid[k], g * 2);
      }
      const ang = Math.atan2(iy, ix);
      const fib = 0.93 + 0.07 * Math.sin(ang * 23) * Math.sin(ang * 7 + 1.3);
      for (let k = 0; k < 3; k++) ir[k] *= fib;
      // Glowing lower crescent.
      blend(ir, pal.irisGlow, smoothstep(0.35, 0.75, q) * smoothstep(1.0, 0.8, q) * smoothstep(-0.1, -0.7, iy) * 0.75);
      // Pupil.
      const pq = Math.hypot((ex - EYE.irisX) / 0.042, (Y - EYE.irisY - 0.012) / 0.066);
      blend(ir, pal.pupil, cov((pq - 1) * 0.042) * 0.92);
      // Dark rim + lid shadow across the top of the iris.
      blend(ir, pal.irisTop, smoothstep(0.8, 1.0, q) * 0.85);
      blend(ir, pal.pupil, smoothstep(0.1, 0.0, yU - Y) * 0.55);
      blend(e, ir, icov);
    }
    // Highlights (world-space offsets so both eyes are lit from the same side).
    const cx = side * EYE.irisX;
    const h1 = Math.hypot((X - (cx - 0.036)) / 0.034, (Y - (EYE.irisY + 0.052)) / 0.044);
    const h2 = Math.hypot((X - (cx + 0.045)) / 0.016, (Y - (EYE.irisY - 0.075)) / 0.016);
    const h3 = Math.hypot((X - (cx + 0.02)) / 0.01, (Y - (EYE.irisY + 0.085)) / 0.01);
    blend(e, [1, 1, 1], cov((h1 - 1) * 0.034));
    blend(e, [1, 1, 1], cov((h2 - 1) * 0.016) * 0.95);
    blend(e, [1, 1, 1], cov((h3 - 1) * 0.01) * 0.9);
    blend(c, e, inside);
  }
  // Pink inner corner.
  blend(c, [0.93, 0.6, 0.6], cov(Math.hypot(ex - EYE.xi - 0.006, Y - (lowerLid(0) + upperLid(0)) / 2) - 0.012) * 0.7);
  // Lash lines on top.
  blend(c, pal.lowerLash, cov(strokeDist(ex, Y, S.lower)));
  blend(c, pal.lash, cov(strokeDist(ex, Y, S.lash)));
  blend(c, pal.lash, cov(strokeDist(ex, Y, S.flickA)));
  blend(c, pal.lash, cov(strokeDist(ex, Y, S.flickB)));
}

function paintFace(c, X, Y, pal, S, aa) {
  const cov = (d) => clamp(0.5 - d / aa, 0, 1);
  const ax = Math.abs(X);
  // Blush with a few diagonal hatch strokes.
  const bq = ((ax - 0.37) / 0.15) ** 2 + ((Y + 0.39) / 0.07) ** 2;
  blend(c, pal.blush, Math.exp(-bq * 1.6) * 0.42);
  for (let i = 0; i < 4; i++) {
    const hx = 0.30 + i * 0.045;
    const d = strokeDist(ax, Y, [[hx + 0.012, -0.37, 0.0035], [hx - 0.014, -0.41, 0.001]]);
    blend(c, [0.94, 0.45, 0.52], cov(d) * 0.55);
  }
  paintEye(c, X, Y, pal, S, aa);
  // Nose: small dot of shade under the tip.
  blend(c, pal.nose, cov(Math.hypot((X - 0.008) / 0.014, (Y + 0.455) / 0.006) - 1) * 0.7);
  // Mouth: gentle smile.
  const mouth = [[-0.068, -0.645, 0.0022], [-0.035, -0.658, 0.0036], [0, -0.661, 0.0042], [0.035, -0.658, 0.0036], [0.068, -0.645, 0.0022]];
  blend(c, pal.mouth, cov(strokeDist(X, Y, mouth)));
  blend(c, [1, 0.72, 0.72], Math.exp(-((X / 0.035) ** 2 + ((Y + 0.692) / 0.012) ** 2)) * 0.35);
}

// radius(theta, y): radial distance from the Y axis to the skin surface.
function makeRadiusLookup(skin) {
  const NT = 480, NY = 480, T0 = -1.5, T1 = 1.5, Y0 = -1.0, Y1 = 0.5;
  const R = new Float32Array(NT * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NT; i++) {
    const th = T0 + (T1 - T0) * i / (NT - 1), y = Y0 + (Y1 - Y0) * j / (NY - 1);
    const s = Math.sin(th), c = Math.cos(th);
    let r = 1.6;
    while (r > 0 && skin(s * r, y, c * r) > 0) r -= 0.02;
    let lo = r, hi = r + 0.02;
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (skin(s * m, y, c * m) > 0) hi = m; else lo = m; }
    R[i + NT * j] = (lo + hi) / 2;
  }
  return (th, y) => {
    if (th < T0 || th > T1 || y < Y0 || y > Y1) return null;
    const fi = (th - T0) / (T1 - T0) * (NT - 1), fj = (y - Y0) / (Y1 - Y0) * (NY - 1);
    const i = Math.min(NT - 2, fi | 0), j = Math.min(NY - 2, fj | 0), ti = fi - i, tj = fj - j;
    const a = R[i + NT * j] * (1 - ti) + R[i + 1 + NT * j] * ti;
    const b = R[i + NT * (j + 1)] * (1 - ti) + R[i + 1 + NT * (j + 1)] * ti;
    return a * (1 - tj) + b * tj;
  };
}

function paintSkin(size, skin, palette = {}) {
  const pal = {};
  for (const [k, v] of Object.entries(Object.assign({}, DEFAULT_PALETTE, palette))) pal[k] = hex(v);
  const S = buildEyeStrokes();
  const radius = makeRadiusLookup(skin);
  const out = new Uint8Array(size * size * 4);
  const aa = 0.0022;
  const c = [0, 0, 0];
  for (let py = 0; py < size; py++) {
    const v = 1 - (py + 0.5) / size; // glTF: v=0 is the top row of the image
    const y = vToY(v);
    for (let px = 0; px < size; px++) {
      const th = uToTheta((px + 0.5) / size);
      c[0] = pal.skin[0]; c[1] = pal.skin[1]; c[2] = pal.skin[2];
      // Slightly warmer, deeper tone on the neck/underside.
      blend(c, pal.skinShade, smoothstep(-0.9, -1.4, y) * 0.35);
      const r = radius(th, y);
      if (r !== null && Math.abs(th) < 1.4) paintFace(c, r * Math.sin(th), y, pal, S, aa);
      const o = 4 * (py * size + px);
      out[o] = clamp(c[0] * 255 + 0.5, 0, 255); out[o + 1] = clamp(c[1] * 255 + 0.5, 0, 255);
      out[o + 2] = clamp(c[2] * 255 + 0.5, 0, 255); out[o + 3] = 255;
    }
  }
  return out;
}

// 1D value noise (periodic) for hair streaks.
function periodicNoise(seed, cells) {
  const vals = new Float32Array(cells);
  let s = seed;
  for (let i = 0; i < cells; i++) { s = (s * 1103515245 + 12345) >>> 0; vals[i] = (s >>> 8) / 16777216; }
  return (u) => {
    const f = ((u % 1) + 1) % 1 * cells, i = Math.floor(f), t = f - i;
    const a = vals[i % cells], b = vals[(i + 1) % cells];
    const w = t * t * (3 - 2 * t);
    return a + (b - a) * w;
  };
}

function paintHair(size, palette = {}) {
  const pal = {};
  for (const [k, v] of Object.entries(Object.assign({}, DEFAULT_PALETTE, palette))) pal[k] = hex(v);
  const n1 = periodicNoise(11, 220), n2 = periodicNoise(23, 70), n3 = periodicNoise(37, 140), n4 = periodicNoise(41, 90);
  const out = new Uint8Array(size * size * 4);
  const c = [0, 0, 0];
  for (let py = 0; py < size; py++) {
    const y = vToY(1 - (py + 0.5) / size);
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const streak = 0.6 * n1(u) + 0.4 * n2(u);
      c[0] = pal.hair[0]; c[1] = pal.hair[1]; c[2] = pal.hair[2];
      // Lighter crown, darker toward the ends; streaks follow the fall of the hair.
      blend(c, pal.hairLight, smoothstep(0.3, 1.1, y) * 0.45 + (streak - 0.5) * 0.25);
      blend(c, pal.hairDark, smoothstep(0.1, -0.9, y) * 0.35 + (0.5 - streak) * 0.2);
      // "Angel ring": a band of spindle-shaped highlight strokes, one per column cell.
      const thU = uToTheta(((u % 1) + 1) % 1), K = 110;
      const cell = Math.floor((thU / (2 * Math.PI) + 0.5) * K), lx = (thU / (2 * Math.PI) + 0.5) * K - cell - 0.5;
      const hsh = (k) => { const x = Math.sin((cell % K) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
      const len = 0.05 + 0.09 * hsh(1), yc = 0.56 + 0.035 * Math.sin(u * Math.PI * 6) + (hsh(2) - 0.5) * 0.05;
      const yy = (y - yc) / len;
      if (Math.abs(yy) < 1 && hsh(3) > 0.12) {
        const half = (0.14 + 0.22 * hsh(4)) * Math.pow(1 - yy * yy, 0.8);
        blend(c, pal.hairShine, smoothstep(half, half - 0.12, Math.abs(lx)) * (0.65 + 0.3 * hsh(5)));
      }
      const o = 4 * (py * size + px);
      out[o] = clamp(c[0] * 255 + 0.5, 0, 255); out[o + 1] = clamp(c[1] * 255 + 0.5, 0, 255);
      out[o + 2] = clamp(c[2] * 255 + 0.5, 0, 255); out[o + 3] = 255;
    }
  }
  return out;
}

module.exports = { paintSkin, paintHair, DEFAULT_PALETTE };
