'use strict';
// State, physics, input, rendering and UI for Pocket Town.
const cv = document.getElementById('c');
const c = cv.getContext('2d');
const dark = document.createElement('canvas');
const dc = dark.getContext('2d');
const SAVE_KEY = 'pocket-town-v1';

const G = {
  chars: [], items: [], F: [], parts: [], anims: [], night: false, camX: 1700, camV: 0, t: 0, nextId: 1,
  drags: new Map(), look: null, scale: 1, offY: 0, W: 0, H: 0, dpr: 1, surfs: [], seats: [], audioOn: false,
};
const FB = {};

function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function animate(obj, key, from, to, dur) { obj[key] = from; G.anims.push({ obj, key, from, to, dur, t: 0 }); }

// ------------------------------------------------------------------ world setup
function setupWorld() {
  G.F = makeFurniture();
  for (const f of G.F) FB[f.id] = f;
  G.surfs = FLOORS.map(([x0, x1, y]) => ({ x0, x1, y }));
  G.seats = [];
  for (const f of G.F) {
    const d = FT[f.t];
    if (d.surf) for (const [x0, x1, y] of d.surf(f)) G.surfs.push({ x0, x1, y });
    if (d.seats) d.seats(f).forEach((s, i) => G.seats.push({ ...s, key: f.id + ':' + i, f }));
  }
}

function newId() { return G.nextId++; }
function spawnItem(k, x, y, o = {}) {
  const it = { id: newId(), k, x, y, vx: o.vx || 0, vy: o.vy || 0, sup: false, col: o.col, v: o.v, bites: 0 };
  G.items.push(it);
  return it;
}
function countItems(k) { return k ? G.items.filter((i) => i.k === k).length : G.items.length; }
function addChar(x, y, look) {
  const ch = { id: newId(), x, y, vy: 0, look, pose: 'fall', seat: null, hold: null, eat: null, happyT: 0, squash: 0, sleep: false, sleepT: 0, swing: 0, sup: false };
  G.chars.push(ch);
  return ch;
}
function addParticle(k, x, y, o = {}) {
  G.parts.push({ k, x, y, vx: o.vx || rand(-20, 20), vy: o.vy === undefined ? rand(-60, -30) : o.vy, life: o.life || 1.2, max: o.life || 1.2, s: o.s || 1, col: o.col, g: o.g || 0 });
  if (G.parts.length > 300) G.parts.shift();
}
function seatUser(fid, i) { return G.chars.find((ch) => ch.seat === fid + ':' + i); }
const itemById = (id) => G.items.find((i) => i.id === id);
const charById = (id) => G.chars.find((ch) => ch.id === id);
function removeItem(it) {
  const i = G.items.indexOf(it);
  if (i >= 0) G.items.splice(i, 1);
  for (const ch of G.chars) { if (ch.hold === it.id) ch.hold = null; if (ch.eat && ch.eat.id === it.id) ch.eat = null; }
}

function newGame() {
  G.chars = []; G.items = []; G.parts = []; G.nextId = 1; G.night = false;
  setupWorld();
  for (const it of initialItems()) { const n = spawnItem(it.k, it.x, it.y, it); n.sup = false; }
  for (const ch of initialChars()) addChar(ch.x, ch.y, ch.look);
  G.camX = 1700;
}

// ------------------------------------------------------------------ save / load
function save() {
  try {
    const st = {};
    for (const f of G.F) st[f.id] = { ...f.st, busy: undefined, shake: undefined, chomp: undefined, bake: undefined };
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, nextId: G.nextId, night: G.night, camX: G.camX,
      chars: G.chars.map((ch) => ({ ...ch, eat: null, slide: null, pose: ch.pose === 'held' ? 'fall' : ch.pose, sup: false })),
      items: G.items.map((it) => ({ ...it, sup: false })), st,
    }));
  } catch (e) { /* storage unavailable */ }
}
function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
  if (!data || data.v !== 1) { newGame(); return; }
  setupWorld();
  G.nextId = data.nextId; G.night = !!data.night; G.camX = data.camX || 1700;
  G.chars = data.chars; G.items = data.items;
  for (const f of G.F) if (data.st[f.id]) Object.assign(f.st, data.st[f.id]);
  for (const ch of G.chars) if (ch.seat && !G.seats.find((s) => s.key === ch.seat)) ch.seat = null;
}

// ------------------------------------------------------------------ physics helpers
function landingY(x, y0, y1) {
  let best = null;
  for (const s of G.surfs) if (x >= s.x0 && x <= s.x1 && s.y >= y0 - 0.5 && s.y <= y1 && (best === null || s.y < best)) best = s.y;
  return best;
}
function onSurface(x, y) { return G.surfs.some((s) => x >= s.x0 && x <= s.x1 && Math.abs(s.y - y) < 1); }
function ceilingAbove(x, top) {
  let best = 110;
  for (const [x0, x1, y] of CEILINGS) if (x >= x0 && x <= x1 && y <= top + 1 && y > best) best = y;
  return best;
}
function containerAt(x, y) {
  for (const f of G.F) {
    const d = FT[f.t];
    if (!d.cont) continue;
    const r = d.cont(f);
    if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return r;
  }
  return null;
}
function hidden(it) {
  if (it.holder) return false;
  const r = containerAt(it.x, it.y - 4);
  return r && !r.open;
}

function stepItem(it, dt) {
  const d = ITEMS[it.k];
  if (hidden(it)) return;
  if (d.float) {
    it.vy = Math.max(it.vy - 260 * dt, -140);
    const ny = it.y + it.vy * dt, cy = ceilingAbove(it.x, it.y - d.h);
    if (ny - d.h <= cy) { it.y = cy + d.h; it.vy = 0; } else it.y = ny;
    it.x += Math.sin(G.t * 0.8 + it.id) * 6 * dt + it.vx * dt; it.vx *= Math.pow(0.1, dt);
    it.x = clamp(it.x, 30, WORLD_W - 30);
    return;
  }
  if (it.sup && !onSurface(it.x, it.y)) it.sup = false;
  if (!it.sup) {
    it.vy += 1900 * dt;
    const ny = it.y + it.vy * dt;
    const ly = it.vy >= 0 ? landingY(it.x, it.y, ny) : null;
    if (ly !== null) {
      it.y = ly;
      if (d.bouncy && it.vy > 350) { it.vy = -it.vy * 0.6; Sfx.bounce(); }
      else { if (it.vy > 500) Sfx.land(); it.vy = 0; it.sup = true; }
    } else it.y = ny;
  }
  if (it.vx) {
    it.x = clamp(it.x + it.vx * dt, 20, WORLD_W - 20);
    it.vx *= Math.pow(it.sup ? (d.bouncy ? 0.4 : 0.002) : 0.7, dt);
    if (Math.abs(it.vx) < 4) it.vx = 0;
  }
}

function stepChar(ch, dt) {
  ch.happyT -= dt; ch.squash = Math.max(0, ch.squash - dt * 4);
  if (ch.slide) {
    const s = ch.slide, f = s.f;
    s.t += dt / 1.1;
    if (s.t < 0) return;
    if (s.t >= 1) {
      ch.slide = null; ch.seat = null; ch.pose = 'stand'; ch.x = f.x + 215; ch.y = GROUND; ch.sup = true; ch.happyT = 1.2; ch.squash = 1; Sfx.boing();
      for (let i = 0; i < 4; i++) addParticle('heart', ch.x + rand(-30, 30), ch.y - 170);
      return;
    }
    const u = s.t * s.t, v = 1 - u;
    const p0 = [f.x - 20, f.y - 226], p1 = [f.x + 60, f.y - 220], p2 = [f.x + 90, f.y - 20], p3 = [f.x + 190, f.y - 18];
    const b = (i) => v * v * v * p0[i] + 3 * v * v * u * p1[i] + 3 * v * u * u * p2[i] + u * u * u * p3[i];
    ch.x = b(0); ch.y = b(1) - 8;
    return;
  }
  if (ch.seat) {
    const s = G.seats.find((q) => q.key === ch.seat);
    if (!s) { ch.seat = null; return; }
    ch.x = s.x; ch.y = s.y;
    if (s.kind === 'lie') {
      ch.sleepT += dt;
      if (ch.sleepT > 1.5) ch.sleep = true;
      if (ch.sleep && Math.random() < dt * 1.2) addParticle('zzz', ch.x - 150, ch.y - 40, { vx: 15, vy: -35, life: 2 });
    }
    if (s.kind === 'bath' && Math.random() < dt * 3) addParticle('bubble', ch.x + rand(-80, 80), ch.y - 40, { vy: rand(-60, -30), life: 1.6 });
    return;
  }
  if (ch.pose === 'held') return;
  if (ch.sup && !onSurface(ch.x, ch.y)) ch.sup = false;
  if (!ch.sup) {
    ch.pose = 'fall';
    ch.vy += 1900 * dt;
    const ny = ch.y + ch.vy * dt;
    const ly = landingY(ch.x, ch.y, ny);
    if (ly !== null) { ch.y = ly; ch.sup = true; ch.pose = 'stand'; ch.squash = Math.min(1, ch.vy / 900); if (ch.vy > 300) Sfx.land(); ch.vy = 0; }
    else ch.y = ny;
  }
}

function stepEat(ch, dt) {
  if (!ch.eat) return;
  const it = itemById(ch.eat.id);
  if (!it) { ch.eat = null; return; }
  ch.eat.t += dt;
  if (ch.eat.t > 0.5) {
    ch.eat.t = 0; it.bites++;
    Sfx.chomp();
    const [hx, hy] = handPos(ch);
    for (let i = 0; i < 3; i++) addParticle('crumb', hx, hy - 20, { vy: rand(-120, -40), vx: rand(-60, 60), g: 600, life: 0.6 });
    if (it.bites >= 4) {
      removeItem(it); ch.eat = null; ch.happyT = 1.3; Sfx.yum();
      for (let i = 0; i < 5; i++) addParticle('heart', ch.x + rand(-40, 40), ch.y - 180 + rand(-20, 20), { life: 1.4 });
    }
  }
}

// ------------------------------------------------------------------ input
function toWorld(sx, sy) { return [G.camX + sx / G.scale, (sy - G.offY) / G.scale]; }

function charBox(ch) {
  switch (ch.pose) {
    case 'lie': return [ch.x - 190, ch.y - 50, ch.x + 20, ch.y + 50];
    case 'sit': return [ch.x - 50, ch.y - 150, ch.x + 50, ch.y + 38];
    case 'bath': return [ch.x - 50, ch.y - 150, ch.x + 50, ch.y - 20];
    default: return [ch.x - 50, ch.y - 186, ch.x + 50, ch.y + 4];
  }
}
function itemBox(it) {
  const d = ITEMS[it.k], hw = Math.max(d.w / 2, 28), h = Math.max(d.h, 50);
  const [x, y] = it.holder ? handPos(charById(it.holder)) : [it.x, it.y];
  return [x - hw, y - h - 6, x + hw, y + 8];
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const dragging = (o) => { for (const d of G.drags.values()) if (d.obj === o) return true; return false; };

function hitTest(x, y) {
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (dragging(it) || hidden(it)) continue;
    if (inBox(itemBox(it), x, y)) return { type: 'item', obj: it };
  }
  for (let i = G.chars.length - 1; i >= 0; i--) {
    const ch = G.chars[i];
    if (dragging(ch)) continue;
    if (inBox(charBox(ch), x, y)) return { type: 'char', obj: ch };
  }
  for (let i = G.F.length - 1; i >= 0; i--) {
    const f = G.F[i], d = FT[f.t];
    if (d.box && d.tap && inBox(d.box(f), x, y)) return { type: 'tap', obj: f };
  }
  return null;
}

function startAudio() {
  if (G.audioOn) return;
  Sfx.init();
  G.audioOn = true;
  for (const f of G.F) {
    if (f.t === 'radio' && f.st.on) Music.set(f.id, true);
    if (f.t === 'tvcab' && f.st.on) Sfx.tv(true);
    if (f.t === 'stove' && f.st.on) Sfx.sizzle(true);
    if (['counter', 'tub', 'bsink'].includes(f.t) && f.st.on) Sfx.water(true, f.t === 'counter' ? 'sink' : f.t);
  }
}

cv.addEventListener('pointerdown', (e) => {
  startAudio();
  cv.setPointerCapture(e.pointerId);
  const [x, y] = toWorld(e.clientX, e.clientY);
  const h = hitTest(x, y);
  const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, vx: 0, lastX: x, lastT: performance.now() };
  if (h) Object.assign(d, h); else { d.type = 'pan'; d.cam0 = G.camX; G.camV = 0; }
  if (d.type === 'item') { d.ox = d.obj.holder ? 0 : d.obj.x - x; d.oy = d.obj.holder ? ITEMS[d.obj.k].h / 2 : d.obj.y - y; }
  G.drags.set(e.pointerId, d);
});

cv.addEventListener('pointermove', (e) => {
  G.look = toWorld(e.clientX, e.clientY);
  const d = G.drags.get(e.pointerId);
  if (!d) return;
  d.sx = e.clientX; d.sy = e.clientY;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) {
    d.moved = true;
    if (d.type === 'item') liftItem(d.obj);
    if (d.type === 'char') liftChar(d.obj);
  }
  if (d.type === 'pan' && d.moved) {
    const nx = d.cam0 - (e.clientX - d.x0) / G.scale;
    const now = performance.now();
    G.camV = (nx - G.camX) / Math.max(1, now - (d.lastT || now)) * 1000;
    d.lastT = now;
    G.camX = nx;
  }
});

function endPointer(e) {
  const d = G.drags.get(e.pointerId);
  if (!d) return;
  G.drags.delete(e.pointerId);
  const quick = performance.now() - d.t0 < 450;
  if (!d.moved) {
    if (!quick) return;
    if (d.type === 'item') tapItem(d.obj);
    else if (d.type === 'char') openEditor(d.obj);
    else if (d.type === 'tap') { FT[d.obj.t].tap(d.obj); save(); }
    return;
  }
  if (d.type === 'item') dropItem(d.obj, d.vx);
  else if (d.type === 'char') dropChar(d.obj, d.vx);
  save();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') G.look = null; });
cv.addEventListener('wheel', (e) => { G.camX += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / G.scale; e.preventDefault(); }, { passive: false });

function liftItem(it) {
  if (it.holder) { const ch = charById(it.holder); if (ch) { ch.hold = null; if (ch.eat && ch.eat.id === it.id) ch.eat = null; } it.holder = null; }
  it.sup = false; it.vx = 0; it.vy = 0;
  Sfx.pick();
}
function liftChar(ch) {
  ch.seat = null; ch.slide = null; ch.sleep = false; ch.sleepT = 0; ch.pose = 'held'; ch.sup = false; ch.vy = 0; ch.eat = null;
  Sfx.squeak();
}

function dropItem(it, vx) {
  const d = ITEMS[it.k];
  const px = it.x, py = it.y - d.h / 2;
  for (const f of G.F) {
    if (FT[f.t].trash && inBox(FT[f.t].box(f), px, py + 20)) {
      removeItem(it); f.st.chomp = 0.4; Sfx.poof();
      for (let i = 0; i < 6; i++) addParticle('poof', f.x + rand(-20, 20), f.y - 70, { vy: rand(-80, -20), life: 0.6 });
      return;
    }
  }
  for (let i = G.chars.length - 1; i >= 0; i--) {
    const ch = G.chars[i];
    if (ch.pose === 'held' || !inBox(charBox(ch), px, py)) continue;
    if (d.wear) { wear(ch, it); return; }
    if (d.food && !ch.eat) {
      if (ch.hold) { const old = itemById(ch.hold); if (old) old.holder = null; ch.hold = null; }
      it.holder = ch.id; ch.hold = it.id; ch.eat = { id: it.id, t: 0.3 };
      return;
    }
    if (ch.hold) { const old = itemById(ch.hold); if (old) { old.holder = null; old.sup = false; } }
    it.holder = ch.id; ch.hold = it.id; ch.happyT = 0.6; Sfx.pop(1.4);
    return;
  }
  it.sup = false; it.vy = 0; it.vx = clamp(vx * 0.6, -900, 900);
  Sfx.drop();
}

function wear(ch, it) {
  const L = ch.look, [hx, hy] = [ch.x, ch.y - 200];
  const give = (k, v) => { const n = spawnItem(k, hx + 40, hy, { vy: -300, vx: rand(80, 160), v }); return n; };
  if (it.k === 'hat') { if (L.hat) give('hat', L.hat); L.hat = it.v; }
  if (it.k === 'glasses') { if (L.glasses) give('glasses', L.glasses); L.glasses = it.v; }
  if (it.k === 'shirt') { give('shirt', { col: L.shirt, style: L.shirtStyle }); L.shirt = it.v.col; L.shirtStyle = it.v.style || 0; }
  removeItem(it);
  ch.happyT = 1.2; Sfx.sparkle();
  for (let i = 0; i < 8; i++) addParticle('spark', ch.x + rand(-50, 50), ch.y - rand(60, 200), { col: pick(['#ffe066', '#ff8fc8', '#7fd6ff']) });
}

function dropChar(ch, vx) {
  const hx = ch.x, hy = ch.y - 40;
  let best = null, bd = 80;
  for (const s of G.seats) {
    if (seatUser(s.f.id, s.key.split(':')[1])) continue;
    const sx = s.sx !== undefined ? s.sx : s.x, sy = s.sy !== undefined ? s.sy : s.y - 20;
    const dd = Math.hypot(hx - sx, hy - sy);
    if (dd < bd) { bd = dd; best = s; }
  }
  if (best) { seat(ch, best); return; }
  ch.pose = 'fall'; ch.sup = false; ch.vy = 0;
}

function seat(ch, s) {
  ch.seat = s.key; ch.x = s.x; ch.y = s.y; ch.sup = true; ch.vy = 0;
  ch.pose = s.kind === 'lie' ? 'lie' : s.kind === 'bath' ? 'bath' : s.kind === 'stand' ? 'stand' : 'sit';
  ch.sleepT = 0; ch.sleep = false;
  if (s.kind === 'slide') { ch.slide = { f: s.f, t: -0.35 }; ch.seat = null; }
  if (s.kind === 'bath') Sfx.water(false, 'x');
  Sfx.pop(0.9);
}

function tapItem(it) {
  it.wiggle = 0.4;
  switch (it.k) {
    case 'ball': if (!it.holder) { it.vy = -900; it.sup = false; it.vx = rand(-150, 150); Sfx.boing(); } break;
    case 'balloon': removeItem(it); Sfx.poof(); for (let i = 0; i < 6; i++) addParticle('spark', it.x, it.y - 84, { col: it.col || '#ff6b9e', vx: rand(-120, 120), vy: rand(-120, 60), life: 0.5 }); break;
    case 'gift': {
      removeItem(it); Sfx.sparkle();
      const k = pick(['teddy', 'ball', 'duck', 'balloon', 'hat', 'glasses', 'cupcake', 'guitar']);
      const o = { vy: -600, col: pick(CLOTH), v: k === 'hat' ? { k: pick(HATS) } : k === 'glasses' ? pick(GLASSES) : undefined };
      spawnItem(k, it.x, it.y - 10, o);
      for (let i = 0; i < 10; i++) addParticle('spark', it.x + rand(-30, 30), it.y - 30, { vx: rand(-150, 150), vy: rand(-250, -50), col: pick(['#ffe066', '#ff8fc8', '#7fd6ff']) });
      break;
    }
    case 'guitar': Sfx.strum(); for (let i = 0; i < 3; i++) addParticle('note', it.x + rand(-20, 20), it.y - 80, { vy: -50, col: pick(['#b99dff', '#ff8fc8', '#7fb6ff']) }); break;
    case 'teddy': case 'duck': Sfx.squeak(); break;
    case 'book': Sfx.pageturn(); break;
    default: Sfx.pop(1.6);
  }
}

// ------------------------------------------------------------------ update
function update(dt) {
  G.t += dt;
  const viewW = G.W / G.scale;
  // drags follow the pointer (also while the camera auto-scrolls)
  for (const d of G.drags.values()) {
    if (d.type === 'pan' || !d.moved) continue;
    const edge = 50;
    if (d.sx < edge) G.camX -= 700 * dt; else if (d.sx > G.W - edge) G.camX += 700 * dt;
    const [x, y] = toWorld(d.sx, d.sy);
    const now = performance.now();
    const ivx = (x - d.lastX) / Math.max(0.001, (now - d.lastT) / 1000);
    d.vx = lerp(d.vx, ivx, 0.3); d.lastX = x; d.lastT = now;
    if (d.type === 'item') { d.obj.x = x + d.ox; d.obj.y = y + d.oy; }
    if (d.type === 'char') {
      d.obj.x = x; d.obj.y = y + 125;
      d.obj.swing = lerp(d.obj.swing || 0, clamp(-d.vx * 0.0012, -0.7, 0.7), 0.15);
    }
  }
  if (!Array.from(G.drags.values()).some((d) => d.type === 'pan')) {
    G.camX += G.camV * dt; G.camV *= Math.pow(0.03, dt);
    if (Math.abs(G.camV) < 5) G.camV = 0;
  }
  if (G.camTarget !== undefined && G.camTarget !== null) {
    G.camX = lerp(G.camX, G.camTarget, 1 - Math.pow(0.002, dt));
    if (Math.abs(G.camX - G.camTarget) < 2) G.camTarget = null;
  }
  G.camX = clamp(G.camX, 0, Math.max(0, WORLD_W - viewW));

  for (let i = G.anims.length - 1; i >= 0; i--) {
    const a = G.anims[i];
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    a.obj[a.key] = lerp(a.from, a.to, k * k * (3 - 2 * k));
    if (k >= 1) G.anims.splice(i, 1);
  }
  for (const f of G.F) {
    for (const k of ['shake', 'chomp', 'bake']) if (f.st[k] > 0) f.st[k] = Math.max(0, f.st[k] - dt);
    if (f.t === 'swing') {
      const busy = !!seatUser(f.id, 0);
      f.st.amp = lerp(f.st.amp || 0, busy ? 0.5 : 0, dt * (busy ? 1 : 0.6));
      f.st.a = Math.sin(G.t * 2.3) * f.st.amp;
    }
    if (f.t === 'stove' && f.st.on && Math.random() < dt * 4) addParticle('steam', f.x + rand(-25, 25), f.y - 125, { vy: -40, life: 1.2 });
    if ((f.t === 'counter' || f.t === 'bsink' || f.t === 'tub') && f.st.on && Math.random() < dt * 10) {
      const x = f.t === 'counter' ? f.x : f.t === 'bsink' ? f.x - 13 : f.x + 70;
      addParticle('drop', x + rand(-4, 4), f.t === 'tub' ? f.y - 80 : f.y - 115, { vy: rand(-60, -20), vx: rand(-40, 40), g: 500, life: 0.4 });
    }
    if (f.t === 'radio' && f.st.on && Math.random() < dt * 2) addParticle('note', f.x + rand(-20, 20), f.y - 60, { vy: -50, col: pick(['#b99dff', '#ff8fc8', '#7fb6ff', '#ffb870']), life: 1.6 });
  }
  for (const it of G.items) {
    if (it.wiggle > 0) it.wiggle -= dt;
    if (it.holder || dragging(it)) continue;
    stepItem(it, dt);
  }
  for (const ch of G.chars) { if (!dragging(ch)) stepChar(ch, dt); else ch.happyT -= dt; stepEat(ch, dt); }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) G.parts.splice(i, 1);
  }
}

// ------------------------------------------------------------------ render
function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = innerWidth; G.H = innerHeight;
  cv.width = dark.width = Math.round(G.W * G.dpr); cv.height = dark.height = Math.round(G.H * G.dpr);
  G.scale = Math.min(G.H / VIEW_H, G.W / 620);
  G.offY = G.H - VIEW_H * G.scale;
}

function worldTransform(ctx) { ctx.setTransform(G.dpr * G.scale, 0, 0, G.dpr * G.scale, -G.camX * G.scale * G.dpr, G.offY * G.dpr); }

function drawHeldItem(ch) {
  if (!ch.hold) return;
  const it = itemById(ch.hold);
  if (!it) { ch.hold = null; return; }
  const [hx, hy] = handPos(ch);
  it.x = hx; it.y = hy + (ch.eat ? ITEMS[it.k].h / 2 : ITEMS[it.k].h * 0.4);
  drawItem(c, it, G.t);
}

function drawCharFull(ch) {
  const s = ch.seat && G.seats.find((q) => q.key === ch.seat);
  c.save();
  if (s && s.kind === 'swing') { const f = s.f, px = f.x, py = f.y - 290; c.translate(px, py); c.rotate(f.st.a || 0); c.translate(-px, -py); }
  drawChar(c, ch, G.t, G.look);
  drawHeldItem(ch);
  c.restore();
}

function render() {
  const viewW = G.W / G.scale, x0 = G.camX - 300, x1 = G.camX + viewW + 300;
  c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  drawSky(c, G.W, G.H, G.camX, G.night, G.t, G.scale);
  worldTransform(c);
  drawHills(c, G.camX, G.night);
  drawTown(c, G.t, G.night);
  const visF = G.F.filter((f) => f.x > x0 && f.x < x1);
  for (const f of visF) FT[f.t].draw(c, f, G.t, 'back');
  for (const it of G.items) if (!it.holder && !dragging(it) && !hidden(it) && it.x > x0 && it.x < x1) drawItem(c, it, G.t);
  for (const ch of G.chars) if (!dragging(ch) && ch.x > x0 && ch.x < x1) drawCharFull(ch);
  for (const f of visF) FT[f.t].draw(c, f, G.t, 'front');
  for (const p of G.parts) drawParticle(c, p);
  for (const d of G.drags.values()) {
    if (!d.moved) continue;
    if (d.type === 'char') drawCharFull(d.obj);
    if (d.type === 'item') drawItem(c, d.obj, G.t);
  }
  drawDarkness(visF);
}

function drawDarkness(visF) {
  const viewW = G.W / G.scale;
  const darkRooms = ROOMS.filter((r) => !G.night && FB[r.light] && FB[r.light].st.on === false && r.x1 > G.camX && r.x0 < G.camX + viewW);
  if (!G.night && !darkRooms.length) return;
  dc.setTransform(1, 0, 0, 1, 0, 0);
  dc.clearRect(0, 0, dark.width, dark.height);
  worldTransform(dc);
  dc.globalCompositeOperation = 'source-over';
  dc.fillStyle = 'rgba(20,20,70,0.55)';
  if (G.night) dc.fillRect(G.camX - 50, -200, viewW + 100, VIEW_H + 400);
  else for (const r of darkRooms) dc.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  dc.globalCompositeOperation = 'destination-out';
  for (const f of visF) {
    const d = FT[f.t];
    if (!d.lights) continue;
    for (const L of d.lights(f)) {
      if (!L.on) continue;
      const g = dc.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g; dc.beginPath(); dc.arc(L.x, L.y, L.r, 0, TAU); dc.fill();
    }
  }
  dc.globalCompositeOperation = 'source-over';
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(dark, 0, 0);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ UI
const $ = (id) => document.getElementById(id);
let editing = null;

function buildTopBar() {
  const bar = $('places');
  for (const p of PLACES) {
    const b = document.createElement('button');
    b.innerHTML = `<span>${p.icon}</span><small>${p.name}</small>`;
    b.onclick = () => { startAudio(); Sfx.click(); G.camTarget = p.x - G.W / G.scale / 2; G.camV = 0; };
    bar.appendChild(b);
  }
  $('btnAdd').onclick = () => {
    startAudio();
    if (G.chars.length >= 24) { toast('もういっぱいだよ！'); return; }
    const ch = addChar(G.camX + G.W / G.scale / 2 + rand(-80, 80), 150, randomLook());
    Sfx.pop(1); openEditor(ch);
  };
  $('btnNight').onclick = () => { startAudio(); G.night = !G.night; Sfx.sparkle(); updateButtons(); save(); };
  $('btnSound').onclick = () => { startAudio(); Sfx.setMuted(!Sfx.muted); updateButtons(); };
  $('btnReset').onclick = () => {
    if (!confirm('まちを さいしょの じょうたいに もどしますか？')) return;
    for (const f of G.F) { if (f.t === 'radio') Music.set(f.id, false); }
    Sfx.tv(false); Sfx.sizzle(false); ['sink', 'tub', 'bsink'].forEach((k) => Sfx.water(false, k));
    newGame(); save(); updateButtons();
  };
  updateButtons();
}
function updateButtons() { $('btnNight').textContent = G.night ? '🌙' : '☀️'; $('btnSound').textContent = Sfx.muted ? '🔇' : '🔊'; }

let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

function thumb(draw) {
  const cvs = document.createElement('canvas'); cvs.width = 112; cvs.height = 112;
  const x = cvs.getContext('2d'); x.scale(112 / 130, 112 / 130); draw(x);
  return cvs;
}
function headThumb(look) {
  return thumb((x) => { const ch = { id: 0, x: 65, y: 205, look, pose: 'stand' }; drawChar(x, ch, 0, null); });
}

function openEditor(ch) {
  editing = ch;
  Sfx.pop(1.2);
  $('editor').classList.remove('hidden');
  renderEditor();
}
function closeEditor() { editing = null; $('editor').classList.add('hidden'); save(); }

function renderEditor() {
  const ch = editing; if (!ch) return;
  const L = ch.look;
  const pv = $('preview'), px = pv.getContext('2d');
  px.setTransform(1, 0, 0, 1, 0, 0); px.clearRect(0, 0, pv.width, pv.height);
  px.setTransform(pv.width / 240, 0, 0, pv.width / 240, 0, 0);
  drawChar(px, { id: ch.id, x: 120, y: 250, look: L, pose: 'stand', happyT: 0 }, performance.now() / 1000, null);
  const rows = $('rows');
  rows.innerHTML = '';
  const row = (label, opts) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<div class="lab">${label}</div>`;
    const w = document.createElement('div'); w.className = 'opts';
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'opt' + (o.sel ? ' sel' : '') + (o.el ? ' pic' : '');
      if (o.col) b.style.background = o.col;
      if (o.el) b.appendChild(o.el); else if (o.text) b.textContent = o.text;
      b.onclick = () => { o.set(); Sfx.pop(1.5); renderEditor(); };
      w.appendChild(b);
    }
    r.appendChild(w); rows.appendChild(r);
  };
  row('はだ', SKINS.map((col) => ({ col, sel: L.skin === col, set: () => { L.skin = col; } })));
  row('かみがた', Array.from({ length: HAIRSTYLES }, (_, i) => ({ el: headThumb({ ...L, hair: i, hat: null, glasses: null }), sel: L.hair === i, set: () => { L.hair = i; } })));
  row('かみのいろ', HAIRC.map((col) => ({ col, sel: L.hairColor === col, set: () => { L.hairColor = col; } })));
  row('め', Array.from({ length: EYESTYLES }, (_, i) => ({ el: headThumb({ ...L, eyes: i, hat: null, glasses: null }), sel: L.eyes === i, set: () => { L.eyes = i; } })));
  row('ふく', Array.from({ length: SHIRTSTYLES }, (_, i) => ({ el: thumb((x) => drawItem(x, { k: 'shirt', x: 65, y: 100, id: 0, v: { col: L.shirt, style: i } }, 0)), sel: L.shirtStyle === i, set: () => { L.shirtStyle = i; } })));
  row('ふくのいろ', CLOTH.map((col) => ({ col, sel: L.shirt === col, set: () => { L.shirt = col; } })));
  row('ズボン', CLOTH.map((col) => ({ col, sel: L.pants === col, set: () => { L.pants = col; } })));
  row('くつ', ['#5b4a44', '#ff6b6b', '#3d3a4a', '#7fb6ff', '#ffffff', '#ffd36e'].map((col) => ({ col, sel: L.shoes === col, set: () => { L.shoes = col; } })));
  row('ぼうし', [{ text: 'なし', sel: !L.hat, set: () => { L.hat = null; } }, ...HATS.map((k) => ({ el: thumb((x) => drawHat(x, { k }, 65, 110)), sel: L.hat && L.hat.k === k, set: () => { L.hat = { k }; } }))]);
  row('めがね', [{ text: 'なし', sel: !L.glasses, set: () => { L.glasses = null; } }, ...GLASSES.map((k) => ({ el: thumb((x) => { x.scale(1.4, 1.4); drawGlasses(x, k, 46, 46); }), sel: L.glasses === k, set: () => { L.glasses = k; } }))]);
}

function setupEditor() {
  $('edOk').onclick = closeEditor;
  $('editor').addEventListener('pointerdown', (e) => { if (e.target.id === 'editor') closeEditor(); });
  $('edRandom').onclick = () => { if (!editing) return; Object.assign(editing.look, randomLook()); Sfx.sparkle(); renderEditor(); };
  $('edDelete').onclick = () => {
    if (!editing) return;
    const ch = editing;
    if (ch.hold) { const it = itemById(ch.hold); if (it) it.holder = null; }
    G.chars.splice(G.chars.indexOf(ch), 1);
    for (let i = 0; i < 8; i++) addParticle('poof', ch.x + rand(-40, 40), ch.y - rand(20, 160), { life: 0.6 });
    Sfx.poof(); closeEditor();
  };
  setInterval(() => { if (editing) { const pv = $('preview'), px = pv.getContext('2d'); px.setTransform(1, 0, 0, 1, 0, 0); px.clearRect(0, 0, pv.width, pv.height); px.setTransform(pv.width / 240, 0, 0, pv.width / 240, 0, 0); drawChar(px, { id: editing.id, x: 120, y: 250, look: editing.look, pose: 'stand' }, performance.now() / 1000, null); } }, 50);
}

// ------------------------------------------------------------------ boot
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
setInterval(save, 4000);
resize();
load();
buildTopBar();
setupEditor();
if (!localStorage.getItem || !(() => { try { return localStorage.getItem('pocket-town-hint'); } catch (e) { return 1; } })()) {
  setTimeout(() => toast('キャラクターや ものを ドラッグして あそぼう！'), 600);
  try { localStorage.setItem('pocket-town-hint', '1'); } catch (e) { /* ignore */ }
}
requestAnimationFrame(frame);
window.__town = G;
