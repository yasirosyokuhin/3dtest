// Texel shaders for the UV baker. Facial features are authored in front-view
// coordinates (X, Y) of the surface point, so they stay undistorted from the
// front no matter how the mesh is unwrapped.
'use strict';
const { clamp, mix, smoothstep } = require('./sdf');

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const DEFAULT_PALETTE = {
  skin: '#fff2ea', skinShade: '#f3c9bd', blush: '#ffa0a8',
  irisTop: '#241008', irisMid: '#6a3a1a', irisBottom: '#d7903f', irisGlow: '#ffd99c', pupil: '#170804',
  sclera: '#ffffff', scleraShade: '#e0d6dc', lash: '#1e1210', lowerLash: '#7c4b3c', crease: '#dca79c',
  brow: '#5e3b2a', mouth: '#5a1f22', mouthIn: '#8c2b33', tongue: '#f2828c', nose: '#e8a292',
  hairDark: '#2c1911', hair: '#5d3b29', hairLight: '#8b5d41', hairShine: '#c9a282',
  hoodie: '#f5c535', hoodieShade: '#d99a1e', strap: '#1c1c21', strapEdge: '#34343c', buckle: '#8a8c93', cord: '#1b1b1f',
};

function palette(over = {}) {
  const pal = {};
  for (const [k, v] of Object.entries(Object.assign({}, DEFAULT_PALETTE, over))) pal[k] = hex(v);
  return pal;
}

function blend(c, col, a) {
  if (a <= 0) return;
  if (a > 1) a = 1;
  c[0] += (col[0] - c[0]) * a; c[1] += (col[1] - c[1]) * a; c[2] += (col[2] - c[2]) * a;
}

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

// ------------------------------------------------------------------ eyes ----
const EYE = { xi: 0.12, xo: 0.5, irisX: 0.306, irisY: -0.245, irisRX: 0.126, irisRY: 0.163 };

function upperLid(t) {
  t = clamp(t, 0, 1);
  return mix(-0.225, -0.2, t) + 0.185 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.92)), 0.5);
}
function lowerLid(t) {
  t = clamp(t, 0, 1);
  return mix(-0.275, -0.245, t) - 0.165 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.02)), 0.75);
}
const eyeT = (ex) => (ex - EYE.xi) / (EYE.xo - EYE.xi);
const eyeX = (t) => EYE.xi + t * (EYE.xo - EYE.xi);

function buildStrokes() {
  const lash = [];
  for (let i = 0; i <= 28; i++) {
    const t = -0.03 + i / 28 * 1.03;
    const r = 0.011 + 0.013 * Math.pow(clamp(t, 0, 1), 0.6);
    lash.push([eyeX(t), upperLid(t) + r * 0.7, r]);
  }
  const yEnd = upperLid(1);
  lash.push([EYE.xo + 0.022, yEnd - 0.01, 0.015], [EYE.xo + 0.05, yEnd - 0.045, 0.004]);
  const flicks = [
    [[eyeX(0.9), upperLid(0.9) + 0.02, 0.01], [EYE.xo + 0.04, upperLid(0.9) + 0.045, 0.002]],
    [[eyeX(0.99), upperLid(1) + 0.01, 0.009], [EYE.xo + 0.055, upperLid(1) + 0.005, 0.002]],
  ];
  const lower = [];
  for (let i = 0; i <= 14; i++) {
    const t = 0.35 + i / 14 * 0.65;
    lower.push([eyeX(t), lowerLid(t) - 0.005, 0.0012 + 0.004 * Math.pow(Math.sin(Math.PI * (t - 0.35) / 0.65 * 0.9), 1.2)]);
  }
  const crease = [];
  for (let i = 0; i <= 14; i++) {
    const t = 0.25 + i / 14 * 0.72;
    crease.push([eyeX(t) + 0.008, upperLid(t) + 0.06 + 0.008 * t, 0.0026 * Math.sin(Math.PI * (i / 14)) + 0.0006]);
  }
  const brow = [[0.12, 0.085, 0.005], [0.2, 0.115, 0.01], [0.31, 0.125, 0.0095], [0.43, 0.1, 0.006], [0.49, 0.075, 0.002]];
  return { lash, flicks, lower, crease, brow };
}
const S = buildStrokes();

function paintEye(c, X, Y, pal, aa) {
  const side = X < 0 ? -1 : 1;
  const ex = Math.abs(X);
  if (ex < 0.04 || ex > 0.62 || Y < -0.5 || Y > 0.2) return;
  const cov = (d) => clamp(0.5 - d / aa, 0, 1);
  const t = eyeT(ex);
  const yU = upperLid(t), yL = lowerLid(t);
  const open = Math.max(Y - yU, yL - Y, EYE.xi - ex, ex - EYE.xo);

  blend(c, pal.brow, cov(strokeDist(ex, Y, S.brow)) * 0.9);
  blend(c, pal.crease, cov(strokeDist(ex, Y, S.crease)) * 0.45);
  // Warm eyelid shadow (soft).
  if (Y > yU) blend(c, pal.skinShade, smoothstep(0.08, 0.0, Y - yU) * smoothstep(-0.05, 0.12, t) * smoothstep(1.08, 0.8, t) * 0.45);

  const inside = cov(open);
  if (inside > 0) {
    const e = pal.sclera.slice();
    blend(e, pal.scleraShade, smoothstep(0.08, 0.0, yU - Y) * 0.7);
    const ix = (ex - EYE.irisX) / EYE.irisRX, iy = (Y - EYE.irisY) / EYE.irisRY;
    const q = Math.hypot(ix, iy);
    const icov = cov((q - 1) * EYE.irisRX);
    if (icov > 0) {
      const g = clamp((iy + 1) / 2, 0, 1);
      const ir = [0, 0, 0];
      for (let k = 0; k < 3; k++) ir[k] = g > 0.45 ? mix(pal.irisMid[k], pal.irisTop[k], (g - 0.45) / 0.55) : mix(pal.irisBottom[k], pal.irisMid[k], g / 0.45);
      const ang = Math.atan2(iy, ix);
      const fib = 0.92 + 0.08 * Math.sin(ang * 26) * Math.sin(ang * 9 + 1.3);
      for (let k = 0; k < 3; k++) ir[k] *= mix(1, fib, smoothstep(0.3, 0.8, q));
      // Glowing lower crescent + sparkle ring.
      blend(ir, pal.irisGlow, smoothstep(0.3, 0.72, q) * smoothstep(1.0, 0.78, q) * smoothstep(-0.05, -0.75, iy) * 0.85);
      // Pupil (soft, heart of the eye).
      const pq = Math.hypot((ex - EYE.irisX) / 0.055, (Y - EYE.irisY - 0.012) / 0.078);
      blend(ir, pal.pupil, cov((pq - 1) * 0.055) * 0.85);
      blend(ir, pal.irisTop, smoothstep(0.82, 1.0, q) * 0.9);
      blend(ir, pal.pupil, smoothstep(0.12, 0.0, yU - Y) * 0.6);
      blend(e, ir, icov);
    }
    // Highlights: big soft one, sharp dot, and a small reflected one below.
    const cx = side * EYE.irisX;
    const h1 = Math.hypot((X - (cx - 0.045)) / 0.045, (Y - (EYE.irisY + 0.06)) / 0.05);
    const h2 = Math.hypot((X - (cx + 0.05)) / 0.018, (Y - (EYE.irisY - 0.085)) / 0.018);
    const h3 = Math.hypot((X - (cx + 0.035)) / 0.012, (Y - (EYE.irisY + 0.095)) / 0.012);
    const h4 = Math.hypot((X - (cx - 0.06)) / 0.02, (Y - (EYE.irisY - 0.05)) / 0.03);
    blend(e, [1, 1, 1], cov((h1 - 1) * 0.04));
    blend(e, [1, 1, 1], cov((h2 - 1) * 0.018) * 0.95);
    blend(e, [1, 1, 1], cov((h3 - 1) * 0.012) * 0.9);
    blend(e, [1, 0.92, 0.98], cov((h4 - 1) * 0.02) * 0.45);
    blend(c, e, inside);
  }
  blend(c, [0.95, 0.62, 0.64], cov(Math.hypot(ex - EYE.xi - 0.006, Y - (lowerLid(0) + upperLid(0)) / 2) - 0.012) * 0.7);
  blend(c, pal.lowerLash, cov(strokeDist(ex, Y, S.lower)));
  blend(c, pal.lash, cov(strokeDist(ex, Y, S.lash)));
  for (const f of S.flicks) blend(c, pal.lash, cov(strokeDist(ex, Y, f)));
}

function paintMouth(c, X, Y, pal, aa) {
  if (Math.abs(X) > 0.14 || Y > -0.55 || Y < -0.75) return;
  const cov = (d) => clamp(0.5 - d / aa, 0, 1);
  // Small open smile: gently curved top edge, round bottom.
  const hw = 0.088;
  const yTop = -0.6 + 0.024 * (X / hw) ** 2;
  const u = clamp(Math.abs(X) / hw, 0, 1);
  const yBot = -0.604 - 0.1 * Math.pow(1 - u * u, 0.55);
  const inside = Math.max(Y - yTop, yBot - Y, Math.abs(X) - hw);
  const m = cov(inside);
  if (m > 0) {
    const col = pal.mouthIn.slice();
    blend(col, pal.mouth, smoothstep(-0.03, 0.0, Y - yTop) * 0.8);
    const tq = Math.hypot(X / 0.062, (Y + 0.69) / 0.04);
    blend(col, pal.tongue, cov((tq - 1) * 0.04));
    blend(c, col, m);
  }
  // Outline + little corner ticks.
  const top = [];
  for (let i = 0; i <= 12; i++) { const x = -hw - 0.006 + i / 12 * (2 * hw + 0.012); top.push([x, -0.6 + 0.024 * Math.min(1.2, (x / hw) ** 2), 0.004]); }
  blend(c, pal.mouth, cov(strokeDist(X, Y, top)));
  const bot = [];
  for (let i = 0; i <= 12; i++) { const x = -hw + i / 12 * 2 * hw; const uu = Math.abs(x) / hw; bot.push([x, -0.604 - 0.1 * Math.pow(Math.max(0, 1 - uu * uu), 0.55), 0.0022]); }
  blend(c, pal.mouth, cov(strokeDist(X, Y, bot)) * 0.8);
}

function paintFace(c, X, Y, pal, aa) {
  const cov = (d) => clamp(0.5 - d / aa, 0, 1);
  const ax = Math.abs(X);
  const bq = ((ax - 0.38) / 0.16) ** 2 + ((Y + 0.47) / 0.075) ** 2;
  blend(c, pal.blush, Math.exp(-bq * 1.3) * 0.38);
  paintEye(c, X, Y, pal, aa);
  blend(c, pal.nose, cov(Math.hypot((X - 0.006) / 0.013, (Y + 0.5) / 0.0065) - 1) * 0.75);
  paintMouth(c, X, Y, pal, aa);
}

function skinShader(over) {
  const pal = palette(over);
  return (ctx) => {
    const c = pal.skin.slice();
    const { p, n } = ctx;
    blend(c, pal.skinShade, smoothstep(-0.8, -1.3, p[1]) * 0.3);
    if (p[2] > 0.15 && n[2] > 0.05 && p[1] > -1 && p[1] < 0.4) paintFace(c, p[0], p[1], pal, 0.0024);
    // Baked occlusion with a warm (subsurface-like) tint.
    const ao = clamp(ctx.ao * 1.1, 0, 1);
    c[0] *= mix(0.8, 1, ao); c[1] *= mix(0.6, 1, ao); c[2] *= mix(0.62, 1, ao);
    return c;
  };
}

const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

function hairShader(over) {
  const pal = palette(over);
  return (ctx) => {
    const { p } = ctx;
    const ao = clamp(ctx.ao * 1.1, 0, 1);
    if (ctx.id < -0.5) { // scalp cap
      const c = mix3(pal.hairDark, pal.hair, 0.45);
      return c.map((v) => v * mix(0.55, 1, ao));
    }
    const id = Math.round(ctx.id), t = ctx.t, ang = ctx.a * 2 * Math.PI;
    const across = Math.cos(ang), up = Math.sin(ang); // across: -1..1 edge to edge; up>0 = outer face
    const c = pal.hair.slice();
    blend(c, pal.hairDark, smoothstep(0.25, 0.0, t) * 0.5);
    blend(c, pal.hairLight, smoothstep(0.55, 1.0, t) * 0.4);
    // Strand lines running along the clump.
    const s = Math.sin(across * 9 + id * 1.7) * 0.5 + Math.sin(across * 23 + id * 3.1) * 0.3;
    for (let k = 0; k < 3; k++) c[k] *= 1 + 0.06 * s;
    // Darker edges and underside: gives each clump a readable silhouette.
    blend(c, pal.hairDark, smoothstep(0.55, 1.0, Math.abs(across)) * 0.35 + (up < 0 ? 0.35 : 0));
    // Angel ring: spindle strokes in a band around the skull.
    if (up > 0) {
      const el = Math.atan2(p[1] - 0.12, Math.hypot(p[0], p[2] + 0.08)) * 180 / Math.PI;
      const lane = Math.floor((across + 1) * 2.5), lx = (across + 1) * 2.5 - lane - 0.5;
      const r1 = hash(id, lane), r2 = hash(id + 17, lane);
      const cen = 44 + (r1 - 0.5) * 8, half = 5 + 6 * r2;
      const yy = (el - cen) / half;
      if (Math.abs(yy) < 1 && r1 > 0.15) {
        const w = (0.18 + 0.2 * r2) * Math.pow(1 - yy * yy, 0.7);
        blend(c, pal.hairShine, smoothstep(w, w - 0.1, Math.abs(lx)) * 0.55);
      }
    }
    return c.map((v) => v * mix(0.5, 1, ao));
  };
}

function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

// Hoodie / accessories. part: 0 torso, 1 hood, 2 strap, 3 buckle, 4 cord.
function clothShader(over) {
  const pal = palette(over);
  return (ctx) => {
    const { p } = ctx;
    const part = Math.round(ctx.part);
    let c;
    if (part <= 1) {
      c = pal.hoodie.slice();
      // Soft knit texture + gentle vertical folds.
      const knit = Math.sin(p[0] * 260) * Math.sin(p[1] * 260) * 0.5 + 0.5;
      const fold = Math.sin(p[0] * 7 + Math.sin(p[1] * 3) * 1.5) * 0.5 + 0.5;
      blend(c, pal.hoodieShade, 0.05 * knit + 0.18 * fold * smoothstep(-1.9, -2.6, p[1]));
      if (part === 1) blend(c, pal.hoodieShade, 0.04);
    } else if (part === 2) c = pal.strap.slice();
    else if (part === 3) c = pal.buckle.slice();
    else c = pal.cord.slice();
    const ao = clamp(ctx.ao * 1.1, 0, 1);
    const a2 = part <= 1 ? mix(0.35, 1, ao) : ao; // fabric bounces a lot of light
    return c.map((v, k) => v * mix(k === 0 ? 0.62 : 0.5, 1, a2));
  };
}

module.exports = { skinShader, hairShader, clothShader, DEFAULT_PALETTE };
