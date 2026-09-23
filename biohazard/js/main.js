'use strict';
// Game loop, rules, input, camera, door transitions and UI.
const $ = (id) => document.getElementById(id);
const canvas = $('gl');

const G = {
  mode: 'title', S: null, P: null, checkpoint: null, t: 0,
  cam: { eye: [0, 3, 0], target: [0, 1, 0], room: -1, zone: -1 },
  door: null, lightning: 0, lightningNext: 6, heartT: 0, invSel: 0, roomNameT: 0,
};

// ------------------------------------------------------------------ state
function newGame() {
  G.S = {
    player: { x: 30, z: 42, yaw: Math.PI, hp: 100, weapon: 'handgun', mag: { handgun: 15, shotgun: 0 }, hasShotgun: false },
    inv: { ammo: 0, shells: 0, herb: 0, keys: [], notes: [] },
    world: newWorldState(),
    stats: { kills: 0, shots: 0, hits: 0, time: 0, herbs: 0, deaths: 0 },
  };
  G.S.world.enemies.forEach(initEnemy);
  loadRuntime();
  saveCheckpoint();
}

function loadRuntime() {
  G.P = { anim: 0, speed: 0, running: false, aimT: 0, fireT: 0, reloadT: 0, hurtT: 0, invuln: 0, muzzleT: 0,
    dead: false, deadT: 0, target: null, autoAimT: 0, queueFire: false, qturn: 0, stepPhase: 0 };
  FX.clear();
  G.cam.zone = -1;
  G.S.world.enemies.forEach(initEnemy);
}

function saveCheckpoint() { G.checkpoint = JSON.stringify(G.S); }
function loadCheckpoint() {
  const deaths = G.S.stats.deaths + 1, time = G.S.stats.time;
  G.S = JSON.parse(G.checkpoint);
  G.S.stats.deaths = deaths; G.S.stats.time = time;
  loadRuntime();
}

const player = () => G.S.player;
const curRoom = () => World.roomAt(G.S.player.x, G.S.player.z);
const hasKey = (k) => G.S.inv.keys.includes(k);

// ------------------------------------------------------------------ input
const keys = {}, pressed = {};
const touch = { x: 0, y: 0, active: false };
let mouseAim = false;
addEventListener('keydown', (e) => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  Sfx.init();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseAim = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  Sfx.init();
  if (e.button === 2) mouseAim = true;
  if (e.button === 0) pressed.Mouse0 = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) mouseAim = false; });

const down = (...c) => c.some((k) => keys[k]);
const hit = (...c) => c.some((k) => pressed[k]);
const K = {
  fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight', 'TouchRun'], aim: ['Space', 'TouchAim'], fire: ['KeyF', 'KeyJ', 'Enter', 'Mouse0', 'TouchFire'],
  use: ['KeyE', 'TouchUse'], reload: ['KeyR'], swap: ['KeyQ'], herb: ['KeyH'], inv: ['Tab', 'KeyI', 'TouchMenu'],
  pause: ['KeyP', 'Escape'], ok: ['Enter', 'KeyE', 'Space', 'TouchUse', 'Mouse0'],
};

// ------------------------------------------------------------------ UI helpers
const UI = {
  toastT: 0,
  toast(msg, t = 2.8) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); this.toastT = t; },
  flash(col = 'rgba(160,0,0,.55)') { const el = $('flash'); el.style.transition = 'none'; el.style.background = col; el.style.opacity = 1; requestAnimationFrame(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; }); },
  screen(id) {
    for (const s of ['title', 'gameover', 'ending', 'pause', 'note', 'inventory']) $(s).classList.toggle('hidden', s !== id);
    $('hud').classList.toggle('hidden', !(id === null || id === 'pause'));
  },
  roomName(name) { const el = $('roomname'); el.textContent = name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); },
  update(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.remove('show');
    const p = player(), w = WEAPONS[p.weapon];
    $('wname').textContent = w.name;
    $('ammo').textContent = `${p.mag[p.weapon]} / ${G.S.inv[w.ammo]}`;
    $('ammo').classList.toggle('low', p.mag[p.weapon] === 0);
    $('reloading').classList.toggle('show', G.P.reloadT > 0);
  },
};

function condition(hp) {
  if (hp > 66) return { label: 'FINE', color: '#4f4', bpm: 68 };
  if (hp > 33) return { label: 'CAUTION', color: '#ec3', bpm: 96 };
  return { label: 'DANGER', color: '#f33', bpm: 132 };
}

// Scrolling ECG trace coloured by condition.
const ECG = (() => {
  const traces = [];
  function wave(ph) {
    ph %= 1;
    if (ph < 0.08) return Math.sin(ph / 0.08 * Math.PI) * 0.12;
    if (ph < 0.14) return 0;
    if (ph < 0.17) return -0.15;
    if (ph < 0.2) return 1;
    if (ph < 0.23) return -0.35;
    if (ph < 0.4) return 0;
    if (ph < 0.52) return Math.sin((ph - 0.4) / 0.12 * Math.PI) * 0.22;
    return 0;
  }
  function make(cv) { const t = { cv, ctx: cv.getContext('2d'), x: 0, ph: 0, prevY: null }; traces.push(t); t.ctx.fillStyle = '#000'; t.ctx.fillRect(0, 0, cv.width, cv.height); return t; }
  function update(dt, hp) {
    const c = condition(hp);
    for (const t of traces) {
      const { ctx, cv } = t, W = cv.width, H = cv.height;
      const px = dt * W * 0.55;
      for (let i = 0; i < px; i++) {
        t.ph += (c.bpm / 60) / (W * 0.55);
        const y = H * 0.62 - wave(t.ph) * H * 0.5;
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(t.x, 0, 6, H);
        ctx.fillStyle = c.color;
        const py = t.prevY === null ? y : t.prevY;
        ctx.fillRect(t.x, Math.min(py, y), 2, Math.abs(py - y) + 2);
        t.prevY = y;
        t.x = (t.x + 1) % W;
        if (t.x === 0) t.prevY = null;
      }
    }
    $('cond').textContent = c.label; $('cond').style.color = c.color;
    $('invcond').textContent = c.label; $('invcond').style.color = c.color;
  }
  return { make, update };
})();

// ------------------------------------------------------------------ player
function tryFire() {
  const p = player(), P = G.P, w = WEAPONS[p.weapon];
  if (P.fireT > 0 || P.reloadT > 0) return;
  if (p.mag[p.weapon] <= 0) {
    Sfx.click(); P.fireT = 0.3;
    if (G.S.inv[w.ammo] > 0) startReload(); else UI.toast('弾がない！');
    return;
  }
  p.mag[p.weapon]--;
  G.S.stats.shots++;
  P.fireT = w.rate;
  P.muzzleT = 0.07;
  if (p.weapon === 'shotgun') Sfx.shotgun(); else Sfx.gun();
  const room = curRoom();
  const hits = new Map();
  for (let k = 0; k < w.pellets; k++) {
    const a = p.yaw + (Math.random() - 0.5) * 2 * w.spread;
    const dx = Math.sin(a), dz = Math.cos(a);
    const wall = World.rayDist(p.x, p.z, dx, dz, 30);
    let best = null, bestT = wall;
    for (const e of G.S.world.enemies) {
      if (e.room !== room || e.state === 'dead' || e.state === 'dormant') continue;
      const r = ENEMY_DEF[e.type].r + 0.12;
      const ex = e.x - p.x, ez = e.z - p.z, t = ex * dx + ez * dz;
      if (t < 0 || t > bestT) continue;
      const perp = Math.abs(ex * dz - ez * dx);
      if (perp < r) { best = e; bestT = t; }
    }
    if (best) {
      let dmg = p.weapon === 'shotgun' ? 1.3 * clamp(1.5 - bestT / 7, 0.25, 1.5) : 1;
      if (p.weapon === 'handgun' && best.type === 'zombie' && Math.random() < 0.08) { dmg = 10; FX.blood(best.x, 1.6, best.z, 20, dx, dz); }
      const h = hits.get(best) || { dmg: 0, dx, dz, hx: p.x + dx * bestT, hz: p.z + dz * bestT };
      h.dmg += dmg;
      hits.set(best, h);
    } else {
      FX.sparks(p.x + dx * (wall - 0.05), 1.4, p.z + dz * (wall - 0.05));
      if (k === 0 && Math.random() < 0.3) Sfx.ricochet();
    }
  }
  for (const [e, h] of hits) hurtEnemy(e, h.dmg, h.dx, h.dz, h.hx, h.hz);
  if (hits.size) G.S.stats.hits++;
}

function hurtEnemy(e, dmg, dx, dz, hx, hz) {
  const d = ENEMY_DEF[e.type];
  e.hp -= dmg;
  FX.blood(hx, e.type === 'dog' ? 0.6 : 1.3, hz, Math.min(24, 6 + Math.round(dmg * 3)), dx, dz);
  Sfx.splat();
  if (e.hp <= 0) {
    e.state = 'dead'; e.t = 0; G.S.stats.kills++;
    if (e.type === 'boss') {
      Sfx.roar();
      G.S.world.items.push({ id: 900, type: 'key_main', x: e.x, z: e.z, y: 0, taken: false });
      World.collide(G.S.world.items[G.S.world.items.length - 1], 0.3);
      UI.toast('G-01 は崩れ落ちた…… 何かが光っている。', 4);
      for (let i = 0; i < 4; i++) FX.blood(e.x, 1.5, e.z, 12);
    } else if (e.type === 'dog') Sfx.bark(0.6);
    else Sfx.groan(0.8, 0.8);
    setTimeout(() => { if (e.state === 'dead') { FX.pool(e.x, e.z, 0.5); FX.pool(e.x + rand(-0.3, 0.3), e.z + rand(-0.3, 0.3), 0.35); } }, 900);
    return;
  }
  e.aggro = true;
  if (e.type !== 'boss' || dmg >= 8) {
    e.state = 'stagger'; e.t = e.type === 'boss' ? 0.45 : 0.35;
    const kb = e.type === 'boss' ? 0.25 : Math.min(0.8, 0.15 * dmg);
    e.x += dx * kb; e.z += dz * kb; World.collide(e, d.r);
  }
}

function startReload() {
  const p = player(), w = WEAPONS[p.weapon];
  if (G.P.reloadT > 0 || p.mag[p.weapon] >= w.cap || G.S.inv[w.ammo] <= 0) return;
  G.P.reloadT = w.reload;
  G.P.aimT = 0;
  Sfx.reload(p.weapon === 'shotgun');
}

function finishReload() {
  const p = player(), w = WEAPONS[p.weapon];
  const n = Math.min(w.cap - p.mag[p.weapon], G.S.inv[w.ammo]);
  p.mag[p.weapon] += n; G.S.inv[w.ammo] -= n;
}

function swapWeapon() {
  const p = player();
  if (!p.hasShotgun) { UI.toast('他に武器を持っていない。'); return; }
  p.weapon = p.weapon === 'handgun' ? 'shotgun' : 'handgun';
  G.P.reloadT = 0; G.P.fireT = 0.4;
  Sfx.pump();
  UI.toast(p.weapon === 'shotgun' ? 'ショットガンに持ち替えた。' : 'ハンドガンに持ち替えた。', 1.5);
}

function useHerb() {
  const p = player();
  if (G.S.inv.herb <= 0) { UI.toast('ハーブを持っていない。'); return false; }
  if (p.hp >= 100) { UI.toast('今は使う必要がない。'); return false; }
  G.S.inv.herb--; G.S.stats.herbs++;
  p.hp = Math.min(100, p.hp + 45);
  Sfx.herb();
  UI.flash('rgba(40,160,60,.35)');
  UI.toast('グリーンハーブを使った。');
  return true;
}

function damagePlayer(dmg, e) {
  const p = player(), P = G.P;
  if (P.invuln > 0 || P.dead) return;
  p.hp -= dmg;
  P.invuln = 1.1; P.hurtT = 0.35; P.reloadT = 0;
  Sfx.bite(); Sfx.hurt();
  UI.flash();
  FX.blood(p.x, 1.4, p.z, 14);
  const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
  p.x += dx / d * 0.7; p.z += dz / d * 0.7; World.collide(p, PLAYER_R);
  if (p.hp <= 0) {
    p.hp = 0; P.dead = true; P.deadT = 0;
    Sfx.scream();
  }
}

function acquireTarget() {
  const p = player(), room = curRoom();
  let best = null, bestScore = 1e9;
  for (const e of G.S.world.enemies) {
    if (e.room !== room || e.state === 'dead' || e.state === 'dormant') continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d > 16) continue;
    const da = Math.abs(angDiff(p.yaw, Math.atan2(dx, dz)));
    if (da > 1.3 || !World.los(p.x, p.z, e.x, e.z, true)) continue;
    const score = d + da * 4;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function updatePlayer(dt) {
  const p = player(), P = G.P;
  P.invuln -= dt; P.hurtT -= dt; P.muzzleT -= dt; P.fireT -= dt;
  if (P.reloadT > 0 && (P.reloadT -= dt) <= 0) { P.reloadT = 0; finishReload(); }
  if (P.dead) {
    P.deadT += dt;
    if (P.deadT > 3 && G.mode === 'play') gameOver();
    return;
  }
  const tx = touch.active ? touch.x : 0, ty = touch.active ? touch.y : 0;
  const L = down(...K.left) || tx < -0.35, Rt = down(...K.right) || tx > 0.35;
  const F = down(...K.fwd) || ty < -0.35, B = down(...K.back) || ty > 0.35;
  const run = down(...K.run) || (touch.active && Math.hypot(tx, ty) > 0.9 && ty < 0);

  if (hit(...K.fire)) { P.queueFire = true; if (!down(...K.aim) && !mouseAim) P.autoAimT = 0.9; }
  if (hit(...K.reload)) startReload();
  if (hit(...K.swap)) swapWeapon();
  if (hit(...K.herb)) useHerb();
  P.autoAimT -= dt;
  const aiming = (down(...K.aim) || mouseAim || P.autoAimT > 0) && P.reloadT <= 0 && P.hurtT <= 0;
  P.aimT = clamp(P.aimT + (aiming ? 7 : -6) * dt, 0, 1);
  P.speed = 0; P.running = false;

  if (P.qturn > 0) {
    const step = Math.min(P.qturn, Math.PI * dt / 0.35);
    p.yaw += step; P.qturn -= step;
  } else if (aiming) {
    if (!P.target || P.target.state === 'dead' || P.aimT < 0.05) P.target = acquireTarget();
    if (L || Rt) { P.target = null; p.yaw += (L ? 1 : -1) * 2.0 * dt; }
    else if (P.target) p.yaw = turnToward(p.yaw, Math.atan2(P.target.x - p.x, P.target.z - p.z), 7 * dt);
    if (P.queueFire && P.aimT > 0.85) { P.queueFire = false; tryFire(); P.autoAimT = Math.max(P.autoAimT, 0.5); }
  } else {
    P.target = null; P.queueFire = false;
    const turn = (L ? 1 : 0) - (Rt ? 1 : 0);
    const tscale = touch.active && (L || Rt) ? clamp(Math.abs(tx) * 1.3, 0.4, 1) : 1;
    p.yaw += turn * (run ? 2.9 : 2.5) * tscale * dt;
    if (B && run && hit(...K.back, ...K.run)) { P.qturn = Math.PI; }
    else if (F) { P.speed = run ? 3.4 : 1.5; P.running = run; }
    else if (B) P.speed = -1.0;
    if (P.hurtT > 0) P.speed *= 0.3;
    if (P.speed) {
      p.x += Math.sin(p.yaw) * P.speed * dt;
      p.z += Math.cos(p.yaw) * P.speed * dt;
      World.collide(p, PLAYER_R);
      const prev = P.anim;
      P.anim += Math.abs(P.speed) * dt * (P.running ? 3.0 : 3.6);
      if (Math.floor(prev / Math.PI) !== Math.floor(P.anim / Math.PI)) Sfx.step(P.running ? 1.3 : 0.8, ROOMS[curRoom()].floor[0] !== MAT.CARPET);
    }
  }
  if (!aiming && hit(...K.use)) interact();
}

// What the player could interact with right now.
function findInteract() {
  const p = player(), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), room = curRoom();
  let best = null, bestD = 1e9;
  for (const it of G.S.world.items) {
    if (it.taken || World.roomAt(it.x, it.z) !== room) continue;
    const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
    if (d < 1.7 && (d < 0.7 || (dx * fx + dz * fz) / d > 0.3) && d < bestD) { best = { kind: 'item', it }; bestD = d; }
  }
  if (best) return best;
  const ax = p.x + fx * 1.1, az = p.z + fz * 1.1;
  const di = World.doorTile(Math.floor(ax / TILE), Math.floor(az / TILE));
  if (di >= 0) return { kind: 'door', di, tx: Math.floor(ax / TILE), tz: Math.floor(az / TILE) };
  for (const pr of World.props) {
    if (!pr.text || pr.room !== room) continue;
    const cx = clamp(ax, pr.x0, pr.x1), cz = clamp(az, pr.z0, pr.z1);
    if (Math.hypot(ax - cx, az - cz) < 0.5) return { kind: 'examine', text: EXAMINE[pr.text] };
  }
  return null;
}

function interact() {
  const f = findInteract();
  if (!f) return;
  if (f.kind === 'item') pickUp(f.it);
  else if (f.kind === 'examine') UI.toast(f.text, 3.5);
  else if (f.kind === 'door') useDoor(f.di, f.tx, f.tz);
}

function pickUp(it) {
  const inv = G.S.inv, p = player();
  it.taken = true;
  Sfx.pickup();
  switch (it.type) {
    case 'herb': inv.herb++; break;
    case 'ammo': inv.ammo += 15; break;
    case 'shells': inv.shells += 6; break;
    case 'shotgun': p.hasShotgun = true; p.mag.shotgun = 6; break;
    case 'note': inv.notes.push(it.note); openNote(it.note); return;
    default:
      inv.keys.push(it.type);
      if (it.type === 'key_main' && !G.S.world.flags.ambush) {
        G.S.world.flags.ambush = true;
        for (const [type, x, z] of HALL_AMBUSH) G.S.world.enemies.push(initEnemy({ type, x, z, yaw: rand(0, 6.28), state: 'idle' }));
        setTimeout(() => { Sfx.stinger(); }, 1200);
      }
  }
  UI.toast(ITEM_INFO[it.type].pick);
}

function useDoor(di, tx, tz) {
  const D = DOORS[di], p = player(), unl = G.S.world.unlocked;
  if (D.lock && !unl[di]) {
    if (!hasKey(D.lock)) { Sfx.locked(); UI.toast(D.lockMsg, 3.5); return; }
    unl[di] = true; Sfx.unlock();
    UI.toast(`${ITEM_INFO[D.lock].name}を使った。`, 2);
  }
  const ptx = Math.floor(p.x / TILE), ptz = Math.floor(p.z / TILE);
  let sx = Math.sign(tx - ptx), sz = Math.sign(tz - ptz);
  if (sx && sz) { if (Math.abs(p.x - (tx + 0.5) * TILE) > Math.abs(p.z - (tz + 0.5) * TILE)) sz = 0; else sx = 0; }
  const dtx = tx + sx, dtz = tz + sz;
  G.door = { t: 0, exit: !!D.exit, col: D.col || [0.34, 0.2, 0.1], wide: !!D.wide,
    dest: { x: (dtx + 0.5) * TILE, z: (dtz + 0.5) * TILE, yaw: Math.atan2(sx, sz) }, sounded: false };
  if (!D.exit && World.tileRoom(dtx, dtz) < 0) { G.door = null; return; }
  G.mode = 'door';
  G.P.aimT = 0;
  $('toast').classList.remove('show');
  $('hud').classList.add('hidden');
}

// ------------------------------------------------------------------ enemies
function moveEnemy(e, dist) {
  const d = ENEMY_DEF[e.type];
  e.x += Math.sin(e.yaw) * dist; e.z += Math.cos(e.yaw) * dist;
  separate(e);
  World.collide(e, d.r);
}

function separate(e) {
  const d = ENEMY_DEF[e.type], p = player();
  for (const o of G.S.world.enemies) {
    if (o === e || o.room !== e.room || o.state === 'dead' || o.state === 'dormant') continue;
    const min = d.r + ENEMY_DEF[o.type].r, dx = e.x - o.x, dz = e.z - o.z, dd = Math.hypot(dx, dz);
    if (dd < min && dd > 1e-4) { e.x += dx / dd * (min - dd) * 0.5; e.z += dz / dd * (min - dd) * 0.5; }
  }
  if (!G.P.dead) {
    const min = d.r + PLAYER_R, dx = e.x - p.x, dz = e.z - p.z, dd = Math.hypot(dx, dz);
    if (dd < min && dd > 1e-4) { e.x += dx / dd * (min - dd); e.z += dz / dd * (min - dd); }
  }
}

function updateEnemy(e, dt) {
  const d = ENEMY_DEF[e.type], p = player();
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  e.anim += dt;
  if (e.state === 'dead') { e.t += dt; return; }
  const vol = clamp(1 - dist / 16, 0, 1);
  if (e.state !== 'dormant' && (e.groanT -= dt) <= 0) {
    e.groanT = rand(3.5, 8);
    if (e.type === 'zombie') Sfx.groan(vol * 0.8, 1);
    else if (e.type === 'dog') { if (e.state === 'chase') Sfx.bark(vol * 0.7); }
    else Sfx.groan(vol, 0.55);
  }
  switch (e.state) {
    case 'dormant':
      if (dist < 3.0 && !G.P.dead) { e.state = 'rise'; e.t = 0; Sfx.groan(1, 0.9); }
      break;
    case 'rise':
      e.t += dt; e.yaw = turnToward(e.yaw, want, dt);
      if (e.t > 1.6) e.state = 'chase';
      break;
    case 'idle':
      e.yaw += Math.sin(e.anim * 0.5) * dt * 0.4;
      if (!G.P.dead && (dist < 2.5 || e.aggro || (dist < d.sight && World.los(e.x, e.z, p.x, p.z)))) {
        e.state = 'chase';
        if (e.type === 'boss' && !G.S.world.flags.bossSeen) { G.S.world.flags.bossSeen = true; Sfx.roar(); UI.toast('「グオオオォォッ！」', 2); }
        if (e.type === 'dog') Sfx.bark(vol);
      }
      break;
    case 'chase': {
      if (G.P.dead) { e.state = 'idle'; break; }
      e.yaw = turnToward(e.yaw, want, d.turn * dt);
      const enraged = e.type === 'boss' && e.hp < ENEMY_DEF.boss.hp * 0.45;
      const sp = d.speed * e.speedMul * (enraged ? 1.45 : 1);
      if (dist > d.reach * 0.7) moveEnemy(e, sp * dt); else separate(e);
      if (dist < d.reach && Math.abs(angDiff(e.yaw, want)) < 0.6) {
        e.state = 'attack'; e.t = 0; e.hitDone = false;
        if (e.type === 'dog') Sfx.bark(1);
        if (e.type === 'boss') Sfx.groan(1, 0.5);
      }
      break;
    }
    case 'attack':
      e.t += dt;
      if (e.t < d.windup) e.yaw = turnToward(e.yaw, want, d.turn * 0.5 * dt);
      if (e.type === 'dog' && e.t > 0.15 && e.t < 0.45) moveEnemy(e, 4.5 * dt);
      if (!e.hitDone && e.t >= d.windup) {
        e.hitDone = true;
        if (e.type === 'boss') { Sfx.thud(); UI.flash('rgba(255,255,255,.08)'); }
        if (dist < d.reach + 0.3 && Math.abs(angDiff(e.yaw, want)) < 1.0) damagePlayer(d.dmg, e);
      }
      if (e.t >= d.windup + d.recover) e.state = 'chase';
      break;
    case 'stagger':
      e.t -= dt;
      if (e.t <= 0) e.state = 'chase';
      break;
  }
  e.room = World.roomAt(e.x, e.z);
}

// ------------------------------------------------------------------ camera, lights, rendering
const LIGHT_GAIN = 1.8, AMB_GAIN = 2.8;
function roomLights(ri, t) {
  const out = [];
  for (const L of ROOMS[ri].lights) {
    let k = 1;
    if (L.f) {
      const n = Math.sin(t * 13.1 + L.p[0]) * Math.sin(t * 7.3 + L.p[2]) * Math.sin(t * 2.9);
      k = 1 - L.f * 0.5 * (1 + n);
      if (L.f > 0.5 && Math.sin(t * 3.7 + L.p[0]) > 0.93) k *= 0.1;
    }
    k *= LIGHT_GAIN;
    out.push({ p: L.p, c: [L.c[0] * k, L.c[1] * k, L.c[2] * k], r: L.r * 1.15 });
  }
  return out;
}

function updateCamera(snap) {
  const p = player(), ri = curRoom();
  const zi = World.camFor(ri, p.x, p.z);
  const target = [p.x, 1.1, p.z];
  if (snap || ri !== G.cam.room || zi !== G.cam.zone) {
    G.cam.room = ri; G.cam.zone = zi;
    G.cam.eye = ROOMS[ri].cams[zi].p.slice();
    G.cam.target = target;
  } else {
    for (let i = 0; i < 3; i++) G.cam.target[i] = lerp(G.cam.target[i], target[i], 0.12);
  }
}

function renderGame() {
  const ri = curRoom(), p = player(), P = G.P, R0 = ROOMS[ri];
  const lights = roomLights(ri, G.t);
  lights.unshift({ p: [p.x, 2.5, p.z], c: [0.4, 0.36, 0.32], r: 5.5 });
  if (P.muzzleT > 0) lights.unshift({ p: muzzlePos(p), c: p.weapon === 'shotgun' ? [3, 2.2, 1] : [2, 1.5, 0.7], r: 9 });
  const flash = R0.windows ? G.lightning : 0;
  const amb = [R0.amb[0] * AMB_GAIN + flash * 0.7, R0.amb[1] * AMB_GAIN + flash * 0.75, R0.amb[2] * AMB_GAIN + flash * 0.9];
  Renderer.begin({ eye: G.cam.eye, target: G.cam.target, fov: 58, amb, fog: [0.004, 0.004, 0.006], fogD: 0.032, lights, time: G.t });
  Renderer.drawWorld();
  for (const it of G.S.world.items) if (!it.taken && World.roomAt(it.x, it.z) === ri) drawItem(it, G.t);
  for (const e of G.S.world.enemies) if (e.room === ri) drawEnemy(e);
  drawPlayer(p, P);
  FX.draw(ri);
}

// The iconic door-opening interstitial.
function renderDoor(t, D) {
  const k = smooth((t - 0.1) / 2.2);
  const camZ = lerp(-3.4, 0.9, k);
  const open = -1.75 * smooth((t - 0.5) / 1.1);
  Renderer.begin({ eye: [0, 1.55, camZ], target: [0, 1.4, camZ + 3], fov: 55, amb: [0.06, 0.05, 0.045], fog: [0, 0, 0], fogD: 0.16,
    lights: [{ p: [0.3, 2.2, camZ + 0.8], c: [3.0, 2.2, 1.5], r: 5.5 }], time: G.t });
  const hw = D.wide ? 1.3 : 0.7, wall = [0.35, 0.2, 0.15];
  Renderer.box(mat(M4.T(0, -0.01, -2.2), M4.S(6, 0.02, 4.4)), [0.35, 0.22, 0.12], MAT.WOOD);
  Renderer.box(mat(M4.T(-hw - 1.6, 1.6, 0), M4.S(3.2, 3.2, 0.3)), wall, MAT.PAPER);
  Renderer.box(mat(M4.T(hw + 1.6, 1.6, 0), M4.S(3.2, 3.2, 0.3)), wall, MAT.PAPER);
  Renderer.box(mat(M4.T(0, 2.8, 0), M4.S(hw * 2, 0.8, 0.3)), wall, MAT.PAPER);
  Renderer.box(mat(M4.T(0, 2.43, -0.16), M4.S(hw * 2 + 0.3, 0.12, 0.05)), [0.15, 0.08, 0.04], MAT.WOOD);
  const leaf = (hx, sgn) => {
    const piv = mat(M4.T(hx, 0, 0), M4.RY(open * sgn));
    const w = D.wide ? hw : hw * 2;
    Renderer.box(mat(piv, M4.T(w / 2 * sgn, 1.2, 0), M4.S(w - 0.04, 2.4, 0.08)), D.col, MAT.WOOD);
    Renderer.box(mat(piv, M4.T((w - 0.15) * sgn, 1.05, -0.07), M4.S(0.06)), [0.85, 0.65, 0.25], MAT.PLAIN);
  };
  leaf(-hw, 1);
  if (D.wide) leaf(hw, -1);
}

// ------------------------------------------------------------------ modes
function startGame() {
  Sfx.init();
  newGame();
  G.mode = 'play';
  UI.screen(null);
  updateCamera(true);
  UI.roomName(ROOMS[curRoom()].name);
  setTimeout(() => UI.toast('洋館に閉じ込められた……玄関の鍵を探して脱出しろ。', 4.5), 800);
}

function retry() {
  loadCheckpoint();
  G.mode = 'play';
  UI.screen(null);
  updateCamera(true);
  UI.roomName(ROOMS[curRoom()].name);
}

function gameOver() {
  G.mode = 'dead';
  UI.screen('gameover');
}

function toTitle() { G.mode = 'title'; UI.screen('title'); }

function ending() {
  G.mode = 'ending';
  const s = G.S.stats, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  let score = 0;
  if (s.time < 600) score += 2; else if (s.time < 900) score += 1;
  if (acc >= 70) score += 2; else if (acc >= 50) score += 1;
  if (s.deaths === 0) score += 1;
  if (s.herbs <= 1) score += 1;
  const rank = score >= 6 ? 'S' : score >= 4 ? 'A' : score >= 2 ? 'B' : 'C';
  $('stats').innerHTML = `
    <div><span>クリアタイム</span><b>${m}:${String(sec).padStart(2, '0')}</b></div>
    <div><span>撃破数</span><b>${s.kills}</b></div>
    <div><span>命中率</span><b>${acc}%</b></div>
    <div><span>ハーブ使用</span><b>${s.herbs}</b></div>
    <div><span>リトライ</span><b>${s.deaths}</b></div>
    <div class="rank"><span>RANK</span><b>${rank}</b></div>`;
  UI.screen('ending');
}

function openNote(key) {
  const n = NOTES[key];
  $('notetitle').textContent = n.title;
  $('notebody').textContent = n.body;
  G.prevMode = G.mode === 'inventory' ? 'inventory' : 'play';
  G.mode = 'note';
  UI.screen('note');
}

function closeNote() {
  if (G.prevMode === 'inventory') openInventory(); else { G.mode = 'play'; UI.screen(null); }
}

function invEntries() {
  const S = G.S, p = S.player, inv = S.inv, e = [];
  e.push({ name: 'ハンドガン', sub: `${p.mag.handgun}/15${p.weapon === 'handgun' ? '　装備中' : ''}`, desc: '9mm自動拳銃。頼れる相棒だ。', act: () => { if (p.weapon !== 'handgun') swapWeapon(); } });
  if (p.hasShotgun) e.push({ name: 'ショットガン', sub: `${p.mag.shotgun}/6${p.weapon === 'shotgun' ? '　装備中' : ''}`, desc: ITEM_INFO.shotgun.desc, act: () => { if (p.weapon !== 'shotgun') swapWeapon(); } });
  if (inv.ammo) e.push({ name: 'ハンドガンの弾', sub: `×${inv.ammo}`, desc: ITEM_INFO.ammo.desc });
  if (inv.shells) e.push({ name: 'ショットガンの弾', sub: `×${inv.shells}`, desc: ITEM_INFO.shells.desc });
  if (inv.herb) e.push({ name: 'グリーンハーブ', sub: `×${inv.herb}`, desc: ITEM_INFO.herb.desc + '（決定で使用）', act: () => { useHerb(); } });
  for (const k of inv.keys) e.push({ name: ITEM_INFO[k].name, sub: '', desc: ITEM_INFO[k].desc });
  for (const n of inv.notes) e.push({ name: NOTES[n].title, sub: 'FILE', desc: '決定で読む', act: () => openNote(n) });
  return e;
}

function openInventory() {
  G.mode = 'inventory';
  UI.screen('inventory');
  renderInventory();
}

function renderInventory() {
  const list = invEntries();
  G.invSel = clamp(G.invSel, 0, list.length - 1);
  const ul = $('invlist');
  ul.innerHTML = '';
  list.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = i === G.invSel ? 'sel' : '';
    li.innerHTML = `<span>${it.name}</span><small>${it.sub}</small>`;
    li.onclick = () => { if (G.invSel === i) invActivate(); else { G.invSel = i; Sfx.ui(); renderInventory(); } };
    ul.appendChild(li);
  });
  $('invdesc').textContent = list[G.invSel] ? list[G.invSel].desc : '';
  const hp = player().hp;
  $('invhp').style.width = `${hp}%`;
  $('invhp').style.background = condition(hp).color;
}

function invActivate() {
  const it = invEntries()[G.invSel];
  if (it && it.act) { it.act(); if (G.mode === 'inventory') renderInventory(); }
}

// ------------------------------------------------------------------ main loop
function resize() {
  const s = Math.min(1, 520 / innerHeight);
  Renderer.resize(Math.max(1, Math.floor(innerWidth * s)), Math.max(1, Math.floor(innerHeight * s)));
}

function updateAmbience(dt) {
  G.lightning = Math.max(0, G.lightning - dt * 5);
  if ((G.lightningNext -= dt) <= 0) {
    G.lightningNext = rand(9, 22);
    G.lightning = 1;
    setTimeout(() => { G.lightning = 0.8; }, 180);
    const inside = !ROOMS[curRoom()].windows;
    Sfx.thunder(inside ? 0.35 : 0.8, rand(0.4, 1.4));
  }
  const hp = player().hp;
  if (hp <= 33 && !G.P.dead) {
    if ((G.heartT -= dt) <= 0) { G.heartT = 60 / condition(hp).bpm; Sfx.heartbeat(0.8); }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;
  resize();

  if (G.mode === 'title') {
    if (hit('Enter', 'Space', 'Mouse0')) startGame();
    renderTitle();
  } else if (G.mode === 'play') {
    G.S.stats.time += dt;
    if (hit(...K.pause)) { G.mode = 'pause'; UI.screen('pause'); }
    else if (hit(...K.inv)) { openInventory(); Sfx.ui(); }
    else {
      updatePlayer(dt);
      const ri = curRoom();
      for (const e of G.S.world.enemies) if (e.room === ri) updateEnemy(e, dt);
      FX.update(dt);
      updateAmbience(dt);
      updateCamera(false);
      const f = G.P.dead || G.mode !== 'play' ? null : findInteract();
      $('prompt').textContent = f ? (f.kind === 'item' ? '[E] 拾う' : f.kind === 'door' ? '[E] 扉を開ける' : '[E] 調べる') : '';
    }
    renderGame();
    UI.update(dt);
    ECG.update(dt, player().hp);
  } else if (G.mode === 'door') {
    const D = G.door;
    D.t += dt;
    if (D.t > 0.8 && D.t < 2.5 && hit(...K.ok)) D.t = 2.5;
    let fade = 0;
    if (D.t < 0.4) { fade = D.t / 0.4; renderGame(); }
    else if (D.t < 2.8) {
      if (!D.sounded) { D.sounded = true; Sfx.door(); }
      fade = D.t < 0.7 ? 1 - (D.t - 0.4) / 0.3 : D.t > 2.5 ? (D.t - 2.5) / 0.3 : 0;
      renderDoor(D.t - 0.4, D);
    } else {
      if (!D.arrived) {
        D.arrived = true;
        if (D.exit) { $('fade').style.opacity = 1; ending(); return requestAnimationFrame(frame); }
        const p = player();
        p.x = D.dest.x; p.z = D.dest.z; p.yaw = D.dest.yaw;
        FX.parts.length = 0;
        updateCamera(true);
        saveCheckpoint();
        UI.roomName(ROOMS[curRoom()].name);
      }
      fade = 1 - (D.t - 2.8) / 0.4;
      renderGame();
      if (D.t >= 3.2) { G.mode = 'play'; G.door = null; fade = 0; $('hud').classList.remove('hidden'); }
    }
    $('fade').style.opacity = clamp(fade, 0, 1);
    UI.update(dt);
  } else if (G.mode === 'pause') {
    if (hit(...K.pause, 'Enter')) { G.mode = 'play'; UI.screen(null); }
    renderGame();
  } else if (G.mode === 'inventory') {
    const n = invEntries().length;
    if (hit('ArrowUp', 'KeyW')) { G.invSel = (G.invSel - 1 + n) % n; Sfx.ui(); renderInventory(); }
    if (hit('ArrowDown', 'KeyS')) { G.invSel = (G.invSel + 1) % n; Sfx.ui(); renderInventory(); }
    if (hit('Enter', 'KeyE', 'Space')) invActivate();
    else if (hit(...K.inv, 'Escape')) { G.mode = 'play'; UI.screen(null); }
    renderGame();
    ECG.update(dt, player().hp);
    UI.update(dt);
  } else if (G.mode === 'note') {
    if (hit(...K.ok, 'Escape', 'Tab')) closeNote();
    renderGame();
  } else if (G.mode === 'dead') {
    if (hit('Enter', 'Space', 'KeyE')) retry();
    else if (hit('Escape')) toTitle();
    renderGame();
  } else if (G.mode === 'ending') {
    if (hit('Enter', 'Space')) { $('fade').style.opacity = 0; toTitle(); }
  }
  if (G.mode !== 'door' && G.mode !== 'ending') $('fade').style.opacity = 0;
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}

// Slow orbit around the dark hall behind the title.
function renderTitle() {
  const a = G.t * 0.08;
  const lights = roomLights(0, G.t);
  const fl = G.lightning;
  G.lightning = Math.max(0, G.lightning - 0.02);
  if ((G.lightningNext -= 1 / 60) <= 0) { G.lightningNext = rand(7, 15); G.lightning = 1; if (Sfx.ready) Sfx.thunder(0.6, 0.8); }
  Renderer.begin({ eye: [30 + Math.sin(a) * 6, 2.6, 34 + Math.cos(a) * 7], target: [30, 1.4, 30], fov: 60,
    amb: [0.12 + fl * 0.7, 0.11 + fl * 0.75, 0.1 + fl * 0.9], fog: [0.004, 0.004, 0.006], fogD: 0.06, lights, time: G.t });
  Renderer.drawWorld();
}

// ------------------------------------------------------------------ touch controls
function setupTouch() {
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!coarse) return;
  $('touch').classList.remove('hidden');
  document.body.classList.add('touch');
  const stick = $('stick'), knob = $('knob');
  let sid = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', (e) => {
    Sfx.init();
    sid = e.pointerId; stick.setPointerCapture(sid);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  const move = (e) => {
    if (e.pointerId !== sid) return;
    const R0 = 55;
    let dx = (e.clientX - cx) / R0, dy = (e.clientY - cy) / R0;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    touch.x = dx; touch.y = dy; touch.active = true;
    knob.style.transform = `translate(${dx * R0}px, ${dy * R0}px)`;
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; touch.active = false; touch.x = touch.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('#touch [data-k]')) {
    const code = b.dataset.k, hold = b.dataset.hold !== undefined;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Sfx.init();
      pressed[code] = true;
      if (hold) keys[code] = true;
      b.classList.add('on');
    });
    const up = () => { if (hold) keys[code] = false; b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
}

// ------------------------------------------------------------------ boot
function boot() {
  try {
    Renderer.init(canvas);
  } catch (err) {
    $('titlehint').textContent = 'このブラウザでは WebGL2 が使えません: ' + err.message;
    return;
  }
  Renderer.setWorld(World.buildMesh());
  ECG.make($('ecg'));
  ECG.make($('invecg'));
  newGame();
  $('title').addEventListener('click', () => { if (G.mode === 'title') startGame(); });
  $('btnretry').onclick = () => retry();
  $('btntitle').onclick = () => toTitle();
  $('btnend').onclick = () => { $('fade').style.opacity = 0; toTitle(); };
  $('note').onclick = () => { if (G.mode === 'note') closeNote(); };
  $('pause').onclick = () => { if (G.mode === 'pause') { G.mode = 'play'; UI.screen(null); } };
  $('invclose').onclick = () => { G.mode = 'play'; UI.screen(null); };
  setupTouch();
  UI.screen('title');
  requestAnimationFrame(frame);
  window.__game = G;
}
boot();
