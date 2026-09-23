'use strict';
// Drawing helpers, characters, items and particles. Everything is vector-drawn on a 2D canvas.
const TAU = Math.PI * 2;

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rs = Array.isArray(r) ? r : [r, r, r, r];
    const [a, b, c, d] = rs.length === 4 ? rs : [rs[0], rs[0], rs[0], rs[0]];
    this.moveTo(x + a, y); this.arcTo(x + w, y, x + w, y + h, b); this.arcTo(x + w, y + h, x, y + h, c);
    this.arcTo(x, y + h, x, y, d); this.arcTo(x, y, x + w, y, a); this.closePath();
  };
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function fRR(c, x, y, w, h, r, col) { rr(c, x, y, w, h, r); c.fillStyle = col; c.fill(); }
function fC(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); }
function fE(c, x, y, rx, ry, col, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = col; c.fill(); }
function fPoly(c, pts, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = col; c.fill(); }
function line(c, x0, y0, x1, y1, w, col) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function heart(c, x, y, s, col) {
  c.beginPath(); c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.45, y - s * 1.1, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.45, y - s * 1.1, x + s, y - s * 0.4, x, y + s * 0.35);
  c.fillStyle = col; c.fill();
}
function star(c, x, y, r, col, pts = 5) {
  c.beginPath();
  for (let i = 0; i < pts * 2; i++) { const a = i / (pts * 2) * TAU - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fillStyle = col; c.fill();
}

// ------------------------------------------------------------------ palettes
const SKINS = ['#ffe3cc', '#f8cba6', '#e9ac80', '#c98a5c', '#96603f', '#634030', '#b8e0a8', '#c7c2ff'];
const HAIRC = ['#3b2a20', '#6b4226', '#b97a3c', '#f5cf6a', '#e8684d', '#f79cc4', '#7cb8ff', '#9c7ae3', '#f3f3f3', '#39b39a'];
const CLOTH = ['#ff8f8f', '#ffb870', '#ffe27a', '#9fe07f', '#6fd3ca', '#7fb6ff', '#b99dff', '#ffa3d2', '#ffffff', '#5d667c', '#e5594c', '#3f8f6b'];
const HAIRSTYLES = 6, SHIRTSTYLES = 3, EYESTYLES = 3;
const HATS = ['cap', 'beanie', 'crown', 'bow', 'top', 'flower'];
const GLASSES = ['round', 'sun', 'star'];
const HAT_COL = { cap: '#ff6b6b', beanie: '#7fb6ff', crown: '#ffd23f', bow: '#ff8fc8', top: '#3d3a4a', flower: '#ffe066' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function randomLook() {
  return {
    skin: pick(SKINS.slice(0, 6)), hair: Math.floor(Math.random() * HAIRSTYLES), hairColor: pick(HAIRC),
    shirt: pick(CLOTH), shirtStyle: Math.floor(Math.random() * SHIRTSTYLES), pants: pick(CLOTH), shoes: pick(['#5b4a44', '#ff6b6b', '#3d3a4a', '#7fb6ff', '#ffffff']),
    eyes: Math.floor(Math.random() * EYESTYLES), hat: null, glasses: null,
  };
}

// ------------------------------------------------------------------ characters
// Local coords: feet at (0,0) when standing; hip at y=-40 (standing) or 0 (sitting).
function drawChar(c, ch, t, look) {
  const L = ch.look, pose = ch.pose;
  c.save();
  c.translate(ch.x, ch.y);
  let hip = -40, legs = 'stand', arms = 'down';
  if (pose === 'held') { c.translate(0, -130); c.rotate(ch.swing || 0); c.translate(0, 130); legs = 'dangle'; arms = 'up'; }
  else if (pose === 'fall') { legs = 'dangle'; arms = 'up'; }
  else if (pose === 'sit' || pose === 'bath') { hip = 0; legs = 'sit'; }
  else if (pose === 'lie') c.rotate(-Math.PI / 2);
  if (ch.happyT > 0 && pose === 'stand') { c.translate(0, -Math.abs(Math.sin(t * 11)) * 12); arms = 'up'; }
  if (ch.squash > 0) c.scale(1 + ch.squash * 0.22, 1 - ch.squash * 0.22);
  const breathe = pose === 'stand' || pose === 'sit' ? Math.sin(t * 2.2 + ch.id) * 1.3 : 0;
  const headY = hip - 96 + breathe;

  if (pose === 'stand') fE(c, 0, 0, 36, 7, 'rgba(60,40,30,.13)');
  hairBack(c, L, headY);

  // legs
  const P = L.pants, S = L.shoes || '#5b4a44';
  if (legs === 'stand') {
    fRR(c, -18, hip - 6, 16, 42, 8, P); fRR(c, 2, hip - 6, 16, 42, 8, P);
    fE(c, -11, -5, 13, 7, S); fE(c, 11, -5, 13, 7, S);
  } else if (legs === 'sit') {
    fRR(c, -19, -10, 16, 42, 8, P); fRR(c, 3, -10, 16, 42, 8, P);
    fE(c, -12, 30, 13, 7, S); fE(c, 12, 30, 13, 7, S);
  } else {
    const s = Math.sin(t * 9 + ch.id) * 5;
    fRR(c, -18 + s * 0.3, hip - 6, 16, 44, 8, P); fRR(c, 2 - s * 0.3, hip - 6, 16, 44, 8, P);
    fE(c, -10 + s, hip + 38, 12, 7, S); fE(c, 10 - s, hip + 38, 12, 7, S);
  }

  // arms behind the body when raised
  const armAng = (side) => {
    if (ch.eat && side === 1) return -2.3 + Math.sin(t * 12) * 0.15;
    if (ch.hold && side === 1) return -1.0;
    if (arms === 'up') return -side * (2.6 + Math.sin(t * 10 + side) * 0.2);
    if (pose === 'sit' || pose === 'bath') return -side * 0.35;
    return -side * (0.16 + Math.sin(t * 2.2 + ch.id) * 0.03);
  };
  const drawArm = (side) => {
    c.save(); c.translate(side * 26, hip - 48); c.rotate(armAng(side));
    fRR(c, -8, -4, 16, 42, 8, L.shirtStyle === 2 ? L.skin : L.shirt);
    fC(c, 0, 40, 9, L.skin);
    c.restore();
  };
  if (arms === 'up') { drawArm(-1); drawArm(1); }

  body(c, L, hip);
  if (arms !== 'up') { drawArm(-1); drawArm(1); }

  // head
  fC(c, -42, headY + 6, 10, L.skin); fC(c, 42, headY + 6, 10, L.skin);
  fC(c, -42, headY + 6, 5, shade(L.skin, -0.12)); fC(c, 42, headY + 6, 5, shade(L.skin, -0.12));
  fC(c, 0, headY, 45, L.skin);
  face(c, ch, headY, t, look);
  hairFront(c, L, headY);
  if (L.hat) drawHat(c, L.hat, 0, headY);
  if (L.glasses) drawGlasses(c, L.glasses, 0, headY + 2);
  c.restore();
}

// Hand position in world space (for held items).
function handPos(ch) {
  if (ch.pose === 'lie') return [ch.x - 60, ch.y - 30];
  const hip = ch.pose === 'sit' || ch.pose === 'bath' ? 0 : -40;
  if (ch.eat) return [ch.x + 22, ch.y + hip - 80];
  return [ch.x + 60, ch.y + hip - 12];
}

function body(c, L, hip) {
  const col = L.shirt;
  if (L.shirtStyle === 2) { // dress
    c.beginPath();
    c.moveTo(-24, hip - 54); c.lineTo(24, hip - 54); c.quadraticCurveTo(30, hip - 30, 38, hip + 14);
    c.quadraticCurveTo(0, hip + 22, -38, hip + 14); c.quadraticCurveTo(-30, hip - 30, -24, hip - 54);
    c.fillStyle = col; c.fill();
    fRR(c, -24, hip - 56, 48, 14, 7, shade(col, -0.1));
    fC(c, 0, hip - 30, 4, shade(col, 0.5));
    return;
  }
  fRR(c, -29, hip - 56, 58, 60, 18, col);
  if (L.shirtStyle === 1) {
    c.save(); rr(c, -29, hip - 56, 58, 60, 18); c.clip();
    for (let y = hip - 46; y < hip + 4; y += 16) { c.fillStyle = shade(col, 0.55); c.fillRect(-30, y, 60, 7); }
    c.restore();
  }
  fE(c, 0, hip - 54, 13, 5, shade(col, -0.15));
  fRR(c, -29, hip - 4, 58, 10, 5, L.pants);
}

function hairBack(c, L, hy) {
  const h = L.hairColor;
  if (L.hair === 1) fRR(c, -50, hy - 20, 100, 104, [40, 40, 26, 26], shade(h, -0.08));
  if (L.hair === 3) {
    for (const s of [-1, 1]) { fC(c, s * 56, hy + 14, 20, h); fC(c, s * 60, hy + 40, 15, h); fC(c, s * 46, hy + 2, 6, '#ff7aa8'); }
  }
  if (L.hair === 4) { fC(c, 0, hy - 50, 22, h); fE(c, 0, hy - 34, 14, 5, '#ff7aa8'); }
}

function hairFront(c, L, hy) {
  const h = L.hairColor, s = L.hair;
  c.beginPath();
  if (s === 5) {
    c.arc(0, hy, 46, Math.PI * 1.08, Math.PI * 1.92);
    c.quadraticCurveTo(0, hy - 30, -43, hy - 16);
    c.fillStyle = shade(h, 0.05); c.fill();
    return;
  }
  c.arc(0, hy, 48, Math.PI, 0);
  c.lineTo(48, hy + 8);
  c.quadraticCurveTo(40, hy - 18, 18, hy - 20);
  c.quadraticCurveTo(0, hy - 8, -12, hy - 22);
  c.quadraticCurveTo(-38, hy - 22, -48, hy + 8);
  c.closePath(); c.fillStyle = h; c.fill();
  if (s === 0) { fRR(c, -52, hy - 14, 18, 52, 9, h); fRR(c, 34, hy - 14, 18, 52, 9, h); }
  if (s === 1) { fRR(c, -52, hy - 14, 17, 70, 9, h); fRR(c, 35, hy - 14, 17, 70, 9, h); }
  if (s === 2) {
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.42;
      const bx = Math.cos(a) * 44, by = hy + Math.sin(a) * 44;
      fPoly(c, [bx - 14, by + 6, bx + Math.cos(a) * 22, by + Math.sin(a) * 22, bx + 14, by + 6], h);
    }
  }
  c.beginPath(); c.arc(0, hy, 40, Math.PI * 1.2, Math.PI * 1.45); c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineCap = 'round'; c.stroke();
}

function face(c, ch, hy, t, look) {
  const L = ch.look;
  let px = 0, py = 0;
  if (look) { const dx = look[0] - ch.x, dy = look[1] - (ch.y + hy); const d = Math.hypot(dx, dy) || 1; px = dx / d * 3; py = dy / d * 2.5; }
  const blink = (t + ch.id * 1.7) % 4 < 0.12;
  let eyes = blink ? 'blink' : 'open', mouth = 'smile';
  if (ch.sleep) { eyes = 'closed'; mouth = 'o'; }
  else if (ch.pose === 'held' || ch.pose === 'fall') { eyes = 'wide'; mouth = 'o'; }
  else if (ch.happyT > 0) { eyes = 'happy'; mouth = 'grin'; }
  if (ch.eat) { mouth = Math.sin(t * 12) > 0 ? 'chomp' : 'grin'; eyes = 'happy'; }
  const ink = '#3a2a2a';
  fE(c, -27, hy + 16, 9, 5.5, 'rgba(255,120,140,.35)'); fE(c, 27, hy + 16, 9, 5.5, 'rgba(255,120,140,.35)');
  for (const s of [-1, 1]) {
    const ex = s * 16, ey = hy + 2;
    if (eyes === 'open' || eyes === 'wide') {
      const r = (L.eyes === 1 ? 7.5 : 6) * (eyes === 'wide' ? 1.25 : 1);
      fE(c, ex + px, ey + py, r * 0.85, r, ink);
      if (L.eyes === 1 || eyes === 'wide') fC(c, ex + px + 2, ey + py - 2.5, r * 0.35, '#fff');
      if (L.eyes === 2) line(c, ex + s * 5, ey - 6, ex + s * 9, ey - 10, 2.5, ink);
    } else if (eyes === 'happy') {
      c.beginPath(); c.arc(ex, ey + 3, 6, Math.PI * 1.15, Math.PI * 1.85); c.lineWidth = 3.5; c.strokeStyle = ink; c.lineCap = 'round'; c.stroke();
    } else {
      c.beginPath(); c.arc(ex, ey - 1, 6, Math.PI * 0.15, Math.PI * 0.85); c.lineWidth = 3; c.strokeStyle = ink; c.lineCap = 'round'; c.stroke();
    }
  }
  const my = hy + 20;
  c.lineCap = 'round';
  if (mouth === 'smile') { c.beginPath(); c.arc(0, my - 4, 7, Math.PI * 0.2, Math.PI * 0.8); c.lineWidth = 3; c.strokeStyle = ink; c.stroke(); }
  else if (mouth === 'grin') { c.beginPath(); c.arc(0, my - 3, 9, 0, Math.PI); c.closePath(); c.fillStyle = '#8a3040'; c.fill(); fE(c, 0, my + 3, 5, 2.5, '#ff8a9a'); }
  else if (mouth === 'o') fE(c, 0, my, 5, 6, '#8a3040');
  else if (mouth === 'chomp') fE(c, 0, my, 8, 7, '#8a3040');
}

function drawHat(c, hat, x, hy) {
  const k = hat.k || hat, col = hat.col || HAT_COL[k];
  c.save(); c.translate(x, hy);
  switch (k) {
    case 'cap': fRR(c, -46, -56, 92, 40, [40, 40, 6, 6], col); fE(c, 38, -18, 34, 8, shade(col, -0.15)); fC(c, 0, -56, 5, shade(col, 0.4)); break;
    case 'beanie': c.beginPath(); c.arc(0, -16, 47, Math.PI, 0); c.fillStyle = col; c.fill(); fRR(c, -50, -24, 100, 16, 8, shade(col, -0.15)); fC(c, 0, -66, 11, '#fff'); break;
    case 'crown': fPoly(c, [-34, -30, -38, -72, -18, -52, 0, -80, 18, -52, 38, -72, 34, -30], col); fC(c, 0, -46, 5, '#ff5d8f'); fC(c, -22, -42, 4, '#5dc8ff'); fC(c, 22, -42, 4, '#7ee07e'); break;
    case 'bow': fPoly(c, [26, -40, 2, -58, 4, -24], col); fPoly(c, [26, -40, 50, -58, 48, -24], col); fC(c, 26, -40, 8, shade(col, -0.15)); break;
    case 'top': fRR(c, -30, -104, 60, 70, 6, col); fRR(c, -30, -52, 60, 12, 0, '#e85a6a'); fE(c, 0, -34, 52, 9, shade(col, 0.1)); break;
    case 'flower': for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; fC(c, -30 + Math.cos(a) * 11, -36 + Math.sin(a) * 11, 9, '#ff9ecb'); } fC(c, -30, -36, 7, col); break;
  }
  c.restore();
}

function drawGlasses(c, k, x, y) {
  c.save(); c.translate(x, y);
  if (k === 'round') { c.lineWidth = 3.5; c.strokeStyle = '#3a2a2a'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 16, 0, 12, 0, TAU); c.stroke(); } line(c, -4, 0, 4, 0, 3, '#3a2a2a'); }
  if (k === 'sun') { for (const s of [-1, 1]) fRR(c, s * 16 - 14, -9, 28, 18, 8, '#2d2d3a'); line(c, -4, -2, 4, -2, 4, '#2d2d3a'); fRR(c, 6, -6, 8, 4, 2, 'rgba(255,255,255,.4)'); }
  if (k === 'star') { for (const s of [-1, 1]) star(c, s * 16, 0, 15, '#ff6fb5'); line(c, -4, 0, 4, 0, 3, '#ff6fb5'); }
  c.restore();
}

// ------------------------------------------------------------------ items
// Each kind: [width, height] hit size, flags. Origin is bottom centre.
const ITEMS = {
  apple: { w: 42, h: 46, food: 1 }, banana: { w: 60, h: 36, food: 1 }, bread: { w: 64, h: 36, food: 1 }, croissant: { w: 62, h: 34, food: 1 },
  cake: { w: 50, h: 46, food: 1 }, donut: { w: 50, h: 32, food: 1 }, icecream: { w: 36, h: 70, food: 1 }, coffee: { w: 38, h: 40, food: 1 },
  milk: { w: 36, h: 58, food: 1 }, pizza: { w: 52, h: 46, food: 1 }, carrot: { w: 30, h: 60, food: 1 }, fish: { w: 64, h: 30, food: 1 },
  cookie: { w: 38, h: 38, food: 1 }, cheese: { w: 50, h: 36, food: 1 }, egg: { w: 30, h: 38, food: 1 }, cupcake: { w: 40, h: 48, food: 1 },
  teddy: { w: 52, h: 62 }, ball: { w: 44, h: 44, bouncy: 1 }, duck: { w: 42, h: 40 }, book: { w: 44, h: 54 }, plant: { w: 44, h: 64 },
  balloon: { w: 44, h: 110, float: 1 }, toothbrush: { w: 16, h: 58 }, gift: { w: 48, h: 48 }, guitar: { w: 40, h: 90 },
  hat: { w: 56, h: 44, wear: 'hat' }, glasses: { w: 50, h: 22, wear: 'glasses' }, shirt: { w: 64, h: 56, wear: 'shirt' },
};
const FOODS = Object.keys(ITEMS).filter((k) => ITEMS[k].food);

function drawItem(c, it, t) {
  const d = ITEMS[it.k];
  c.save();
  c.translate(it.x, it.y);
  if (it.wiggle > 0) c.rotate(Math.sin(it.wiggle * 30) * 0.15);
  if (it.bites) {
    // Bite marks: clip away circles on the upper right.
    c.beginPath(); c.rect(-80, -140, 160, 150);
    for (let i = 0; i < it.bites; i++) c.arc(d.w / 2 - 4 - i * 12, -d.h + 4 + i * 10, 13, 0, TAU);
    c.clip('evenodd');
  }
  const col = it.col;
  switch (it.k) {
    case 'apple': fC(c, 0, -21, 21, '#ff5d5d'); fC(c, -7, -28, 6, 'rgba(255,255,255,.45)'); line(c, 0, -40, 2, -48, 4, '#7a5030'); fE(c, 9, -46, 9, 5, '#6bd06b', -0.4); break;
    case 'banana': c.beginPath(); c.arc(0, -50, 44, 0.35 * Math.PI, 0.72 * Math.PI); c.lineWidth = 16; c.strokeStyle = '#ffd84d'; c.lineCap = 'round'; c.stroke(); fC(c, 19, -12, 4, '#7a5030'); break;
    case 'bread': fRR(c, -32, -36, 64, 36, [20, 20, 8, 8], '#e3a261'); for (const x of [-14, 0, 14]) line(c, x - 5, -28, x + 5, -20, 3, '#c67c3e'); break;
    case 'croissant': for (const [x, s] of [[-20, 12], [-8, 16], [8, 16], [20, 12]]) fE(c, x, -16, s, 14, x % 2 ? '#e8a456' : '#d98f45', x * 0.02); break;
    case 'cake': fPoly(c, [-25, -2, 25, -2, 25, -30, -25, -38], '#ffe3b0'); fPoly(c, [-25, -16, 25, -12, 25, -18, -25, -22], '#ff8fb1'); fPoly(c, [-25, -38, 25, -30, 25, -36, -25, -46], '#fff6f0'); fC(c, 4, -44, 7, '#ff4d6d'); break;
    case 'donut': c.beginPath(); c.ellipse(0, -16, 25, 16, 0, 0, TAU); c.ellipse(0, -17, 8, 5, 0, 0, TAU); c.fillStyle = '#e3a261'; c.fill('evenodd');
      c.beginPath(); c.ellipse(0, -19, 21, 12, 0, 0, TAU); c.ellipse(0, -18, 9, 5.5, 0, 0, TAU); c.fillStyle = col || '#ff8fc8'; c.fill('evenodd');
      for (let i = 0; i < 7; i++) { const a = i * 0.9; fRR(c, Math.cos(a) * 15 - 2, -19 + Math.sin(a) * 8, 5, 2.5, 1, ['#fff', '#7fd6ff', '#ffe27a'][i % 3]); } break;
    case 'icecream': fPoly(c, [-15, -34, 15, -34, 0, 0], '#e8b06a'); fC(c, 0, -42, 16, col || '#ffb3d1'); fC(c, 0, -60, 13, '#fff3c4'); fC(c, 3, -72, 5, '#ff4d6d'); break;
    case 'coffee': fRR(c, -17, -34, 34, 34, [4, 4, 12, 12], '#ffffff'); fE(c, 0, -33, 16, 4, '#8a5a3b'); c.beginPath(); c.arc(18, -18, 8, -1.2, 1.2); c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke(); fRR(c, -17, -22, 34, 8, 0, '#ffb870'); break;
    case 'milk': fRR(c, -17, -46, 34, 46, 4, '#f5f7ff'); fPoly(c, [-17, -46, 17, -46, 10, -58, -10, -58], '#dfe6ff'); fRR(c, -17, -32, 34, 16, 0, '#7fb6ff'); fC(c, 0, -24, 5, '#fff'); break;
    case 'pizza': fPoly(c, [-26, -44, 26, -44, 0, 0], '#ffd36e'); fRR(c, -28, -48, 56, 10, 5, '#d98f45'); for (const [x, y] of [[-9, -34], [8, -30], [0, -16]]) fC(c, x, y, 5, '#e5594c'); break;
    case 'carrot': fPoly(c, [-12, -44, 12, -44, 0, 0], '#ff9a3d'); for (const a of [-0.4, 0, 0.4]) fE(c, Math.sin(a) * 8, -52, 5, 11, '#6bd06b', a); break;
    case 'fish': fE(c, -4, -15, 26, 14, '#7fb6ff'); fPoly(c, [18, -15, 34, -28, 34, -2], '#6aa0ea'); fC(c, -18, -18, 3.5, '#223'); break;
    case 'cookie': fC(c, 0, -19, 19, '#e0a868'); for (const [x, y] of [[-7, -24], [6, -14], [5, -27], [-5, -11]]) fC(c, x, y, 3, '#6b4226'); break;
    case 'cheese': fPoly(c, [-25, 0, 25, 0, 25, -22, -25, -34], '#ffd84d'); fC(c, -8, -14, 4, '#f0b92e'); fC(c, 10, -8, 3, '#f0b92e'); break;
    case 'egg': fE(c, 0, -19, 15, 19, '#fffaf0'); fC(c, -4, -26, 4, 'rgba(255,255,255,.9)'); break;
    case 'cupcake': fPoly(c, [-16, -22, 16, -22, 11, 0, -11, 0], '#7fb6ff'); fC(c, -8, -28, 10, '#fff0f6'); fC(c, 8, -28, 10, '#fff0f6'); fC(c, 0, -36, 11, '#ffc2dc'); fC(c, 0, -46, 5, '#ff4d6d'); break;
    case 'teddy': fC(c, -15, -58, 9, '#c68a5a'); fC(c, 15, -58, 9, '#c68a5a'); fE(c, 0, -20, 20, 20, '#c68a5a'); fC(c, 0, -46, 18, '#d39a68'); fE(c, 0, -41, 8, 6, '#f2d3b0'); fC(c, -6, -50, 2.5, '#332'); fC(c, 6, -50, 2.5, '#332'); fC(c, 0, -43, 2.5, '#332'); fE(c, 0, -18, 10, 11, '#f2d3b0'); break;
    case 'ball': fC(c, 0, -22, 22, col || '#ff6b6b'); c.save(); c.beginPath(); c.arc(0, -22, 22, 0, TAU); c.clip(); c.fillStyle = '#fff'; c.fillRect(-22, -27, 44, 10); c.restore(); fC(c, -8, -32, 5, 'rgba(255,255,255,.5)'); break;
    case 'duck': fE(c, 0, -14, 20, 14, '#ffd84d'); fC(c, 10, -30, 11, '#ffd84d'); fE(c, 22, -29, 8, 4, '#ff9a3d'); fC(c, 12, -33, 2.5, '#223'); break;
    case 'book': fRR(c, -20, -54, 40, 54, 3, col || '#7fb6ff'); fRR(c, 14, -52, 5, 50, 1, '#fff'); fRR(c, -12, -44, 22, 8, 2, 'rgba(255,255,255,.6)'); break;
    case 'plant': fPoly(c, [-18, -24, 18, -24, 13, 0, -13, 0], '#e2805a'); for (const a of [-0.6, -0.2, 0.2, 0.6]) fE(c, Math.sin(a) * 16, -40 - Math.cos(a) * 6, 7, 17, '#57c26b', a); fC(c, 0, -58, 7, '#ff8fc8'); break;
    case 'balloon': line(c, 0, 0, Math.sin(t * 2 + it.id) * 4, -58, 1.5, '#888'); fE(c, 0, -84, 22, 27, col || '#ff6b9e'); fPoly(c, [-4, -56, 4, -56, 0, -60], col || '#ff6b9e'); fE(c, -8, -94, 5, 8, 'rgba(255,255,255,.45)', -0.4); break;
    case 'toothbrush': fRR(c, -4, -58, 8, 58, 4, '#7fd6ff'); fRR(c, -5, -58, 10, 14, 3, '#fff'); break;
    case 'gift': fRR(c, -23, -38, 46, 38, 4, col || '#b99dff'); fRR(c, -26, -44, 52, 12, 4, shade(col || '#b99dff', -0.12)); fRR(c, -4, -44, 8, 44, 0, '#ffe27a'); fE(c, -9, -48, 9, 6, '#ffe27a', 0.4); fE(c, 9, -48, 9, 6, '#ffe27a', -0.4); break;
    case 'guitar': fRR(c, -3, -90, 6, 50, 2, '#7a5030'); fE(c, 0, -26, 18, 26, '#ff9a3d'); fE(c, 0, -46, 13, 14, '#ff9a3d'); fC(c, 0, -30, 6, '#5b3a22'); fRR(c, -6, -94, 12, 12, 3, '#5b3a22'); break;
    case 'hat': drawHat(c, it.v, 0, 30); break;
    case 'glasses': drawGlasses(c, it.v, 0, -11); break;
    case 'shirt': {
      const s = it.v || {}, sc = s.col || '#7fb6ff';
      fPoly(c, [-18, -56, 18, -56, 32, -44, 24, -34, 18, -38, 18, 0, -18, 0, -18, -38, -24, -34, -32, -44], sc);
      if (s.style === 1) for (let y = -46; y < 0; y += 12) fRR(c, -18, y, 36, 5, 0, shade(sc, 0.55));
      if (s.style === 2) fPoly(c, [-18, -20, 18, -20, 28, 0, -28, 0], sc);
      fE(c, 0, -56, 8, 4, shade(sc, -0.2));
      break;
    }
  }
  c.restore();
}

// ------------------------------------------------------------------ particles
function drawParticle(c, p) {
  const a = Math.min(1, p.life / p.max * 2);
  c.save(); c.globalAlpha = a; c.translate(p.x, p.y);
  const s = p.s || 1;
  switch (p.k) {
    case 'heart': heart(c, 0, 0, 12 * s, '#ff5d8f'); break;
    case 'spark': star(c, 0, 0, 9 * s * (0.6 + 0.4 * Math.sin(p.life * 20)), p.col || '#ffe066', 4); break;
    case 'zzz': c.font = `bold ${22 * s}px sans-serif`; c.fillStyle = '#7f8fff'; c.fillText('z', 0, 0); break;
    case 'note': c.font = `bold ${24 * s}px sans-serif`; c.fillStyle = p.col || '#b99dff'; c.fillText('♪', 0, 0); break;
    case 'bubble': c.beginPath(); c.arc(0, 0, 8 * s, 0, TAU); c.fillStyle = 'rgba(220,240,255,.7)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke(); break;
    case 'drop': fE(c, 0, 0, 3, 5, '#7fc8ff'); break;
    case 'poof': fC(c, 0, 0, 16 * s * (1.5 - a * 0.5), 'rgba(255,255,255,.8)'); break;
    case 'crumb': fC(c, 0, 0, 3, p.col || '#e0a868'); break;
    case 'steam': fC(c, 0, 0, 7 * s * (2 - a), 'rgba(255,255,255,.35)'); break;
    case 'fire': fE(c, 0, 0, 5 * s, 9 * s, p.col || '#ffb03a'); break;
  }
  c.restore();
}
