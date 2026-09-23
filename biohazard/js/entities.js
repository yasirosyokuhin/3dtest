'use strict';
// Player, enemies, particles and their blocky models.
const R = Renderer;

const ENEMY_DEF = {
  zombie: { hp: 6, r: 0.35, speed: 0.75, reach: 1.0, windup: 0.6, recover: 1.3, dmg: 18, sight: 12, turn: 1.8 },
  dog: { hp: 3, r: 0.35, speed: 4.2, reach: 1.25, windup: 0.35, recover: 0.9, dmg: 10, sight: 14, turn: 6 },
  boss: { hp: 70, r: 0.6, speed: 1.35, reach: 1.9, windup: 0.75, recover: 1.1, dmg: 34, sight: 18, turn: 2.4 },
};
const WEAPONS = {
  handgun: { name: 'HANDGUN', cap: 15, rate: 0.3, reload: 1.3, pellets: 1, spread: 0.015, ammo: 'ammo' },
  shotgun: { name: 'SHOTGUN', cap: 6, rate: 0.95, reload: 2.2, pellets: 7, spread: 0.13, ammo: 'shells' },
};
const PLAYER_R = 0.35;

function initEnemy(e) {
  const d = ENEMY_DEF[e.type];
  if (e.hp === undefined) e.hp = d.hp;
  e.t = e.t || 0;
  e.anim = e.anim || Math.random() * 6;
  e.groanT = e.groanT || rand(1, 6);
  e.speedMul = e.speedMul || rand(0.85, 1.2);
  e.room = World.roomAt(e.x, e.z);
  return e;
}

// ------------------------------------------------------------------ particles
const FX = {
  parts: [], decals: [],
  clear() { this.parts.length = 0; this.decals.length = 0; },
  blood(x, y, z, n = 10, dirx = 0, dirz = 0) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x, y, z, vx: rand(-1.5, 1.5) + dirx * 2, vy: rand(0.5, 3), vz: rand(-1.5, 1.5) + dirz * 2,
        life: rand(0.5, 1.2), s: rand(0.04, 0.09), col: [rand(0.25, 0.4), 0, 0], mat: 0, blood: true });
    }
  },
  sparks(x, y, z) {
    for (let i = 0; i < 6; i++) {
      this.parts.push({ x, y, z, vx: rand(-2, 2), vy: rand(0, 2.5), vz: rand(-2, 2), life: rand(0.1, 0.3), s: 0.03, col: [1, 0.8, 0.4], mat: MAT.EMIT });
    }
  },
  pool(x, z, s) {
    this.decals.push({ x, z, s, r: Math.random() * 3, room: World.roomAt(x, z) });
    if (this.decals.length > 140) this.decals.shift();
  },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.01) {
        if (p.blood && Math.random() < 0.35 && World.roomAt(p.x, p.z) >= 0) this.pool(p.x, p.z, rand(0.1, 0.25));
        p.life = 0;
      }
      if (p.life <= 0) this.parts.splice(i, 1);
    }
  },
  draw(room) {
    for (const p of this.parts) R.box(mat(M4.T(p.x, p.y, p.z), M4.S(p.s)), p.col, p.mat);
    for (const d of this.decals) if (d.room === room) R.box(mat(M4.T(d.x, 0.006, d.z), M4.RY(d.r), M4.S(d.s * 2, 0.006, d.s * 1.6)), [0.22, 0.01, 0.01], MAT.BLOOD);
  },
};

// ------------------------------------------------------------------ models
function part(base, px, py, pz, sx, sy, sz, col, m = MAT.CLOTH) { R.box(mat(base, M4.T(px, py, pz), M4.S(sx, sy, sz)), col, m); }

// Blocky humanoid facing +z, feet at the origin. The character's right side is -x.
function drawHumanoid(root, o) {
  const legL = mat(root, M4.T(0.11, 0.92, 0), M4.RX(o.legL || 0));
  const legR = mat(root, M4.T(-0.11, 0.92, 0), M4.RX(o.legR || 0));
  for (const lg of [legL, legR]) {
    part(lg, 0, -0.43, 0, 0.17, 0.86, 0.19, o.pants);
    part(lg, 0, -0.86, 0.05, 0.18, 0.1, 0.28, o.shoes || [0.08, 0.07, 0.06]);
  }
  const body = mat(root, M4.T(0, 0.92, 0), M4.RX(o.lean || 0));
  part(body, 0, 0.3, 0, 0.44, 0.6, 0.26, o.shirt);
  if (o.vest) part(body, 0, 0.36, 0, 0.47, 0.38, 0.29, o.vest);
  part(body, 0, 0.02, 0, 0.46, 0.08, 0.28, [0.1, 0.08, 0.06]);
  if (o.wound) part(body, 0.08, 0.38, 0.131, 0.16, 0.14, 0.01, [0.35, 0.02, 0.02], MAT.PLAIN);
  const head = mat(body, M4.T(0, 0.62, 0), M4.RZ(o.headTilt || 0), M4.RX(o.headNod || 0));
  part(head, 0, 0.13, 0, 0.22, 0.25, 0.24, o.skin);
  part(head, 0, 0.26, -0.01, 0.24, 0.07, 0.27, o.hair);
  part(head, 0, 0.16, -0.11, 0.24, 0.2, 0.06, o.hair);
  const eyeCol = o.eyes || [0.05, 0.04, 0.04];
  part(head, 0.05, 0.15, 0.121, 0.045, 0.03, 0.01, eyeCol, o.eyes ? MAT.EMIT : MAT.PLAIN);
  part(head, -0.05, 0.15, 0.121, 0.045, 0.03, 0.01, eyeCol, o.eyes ? MAT.EMIT : MAT.PLAIN);
  if (o.mouth) part(head, 0, 0.05, 0.121, 0.1, 0.035, 0.01, o.mouth, MAT.PLAIN);
  const armL = mat(body, M4.T(0.29, 0.55, 0), M4.RX(o.armL || 0), M4.RZ(o.armLz || 0));
  const armR = mat(body, M4.T(-0.29, 0.55, 0), M4.RX(o.armR || 0), M4.RZ(o.armRz || 0));
  for (const a of [armL, armR]) {
    part(a, 0, -0.28, 0, 0.13, 0.58, 0.14, o.sleeve || o.shirt);
    part(a, 0, -0.61, 0, 0.1, 0.1, 0.1, o.skin);
  }
  if (o.claw) {
    part(armR, 0, -0.35, 0, 0.24, 0.75, 0.24, [0.5, 0.12, 0.1], MAT.CLOTH);
    for (const dx of [-0.07, 0, 0.07]) part(armR, dx, -0.9, 0.03, 0.04, 0.35, 0.04, [0.85, 0.82, 0.7], MAT.PLAIN);
  }
  if (o.gun === 'handgun') part(armR, 0, -0.66, 0.05, 0.05, 0.24, 0.11, [0.12, 0.12, 0.13], MAT.METAL);
  if (o.gun === 'shotgun') {
    part(armR, 0, -0.78, 0.03, 0.06, 0.8, 0.07, [0.12, 0.12, 0.13], MAT.METAL);
    part(armR, 0, -0.35, 0.05, 0.07, 0.3, 0.1, [0.35, 0.2, 0.1], MAT.WOOD);
  }
  return { body, armR };
}

function fallPose(root, t) {
  // Falls backwards and ends lying on the floor.
  const k = smooth(t);
  return mat(root, M4.T(0, 0.12 * k, -0.2 * k), M4.RX(-Math.PI / 2 * k));
}

function drawPlayer(p, P) {
  let root = mat(M4.T(p.x, 0, p.z), M4.RY(p.yaw));
  if (P.dead) root = fallPose(root, P.deadT / 0.9);
  const sw = Math.sin(P.anim) * clamp(Math.abs(P.speed) / 1.5, 0, 1) * (P.running ? 0.8 : 0.5);
  const aim = P.aimT;
  const recoil = P.muzzleT > 0 ? 0.25 : 0;
  const armAim = -Math.PI / 2 - recoil;
  const o = {
    skin: [0.78, 0.6, 0.48], hair: [0.18, 0.11, 0.06], shirt: [0.2, 0.3, 0.38], sleeve: [0.2, 0.3, 0.38],
    vest: [0.12, 0.14, 0.12], pants: [0.14, 0.16, 0.2], shoes: [0.06, 0.05, 0.05],
    legL: sw, legR: -sw,
    armL: lerp(-sw * 0.8, armAim + 0.1, aim), armR: lerp(sw * 0.8, armAim, aim),
    armLz: lerp(0, -0.35, aim), armRz: lerp(0, 0.1, aim),
    lean: P.hurtT > 0 ? -0.25 : (P.running ? 0.12 : 0),
    gun: p.weapon,
  };
  if (p.weapon === 'shotgun' && aim < 0.5) { o.armR = -0.3; o.armL = -0.5; o.armLz = -0.4; }
  if (P.reloadT > 0) { o.armR = -1.0; o.armL = -1.1; o.armLz = -0.5; o.armRz = 0.3; }
  drawHumanoid(root, o);
  if (P.muzzleT > 0) {
    const m = muzzlePos(p);
    R.box(mat(M4.T(m[0], m[1], m[2]), M4.RY(Math.random() * 3), M4.S(p.weapon === 'shotgun' ? 0.28 : 0.16)), [1, 0.85, 0.4], MAT.EMIT);
  }
}

function muzzlePos(p) {
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const len = p.weapon === 'shotgun' ? 1.35 : 0.95;
  return [p.x + fx * len - fz * 0.05, 1.47, p.z + fz * len + fx * 0.05];
}

function drawZombie(e) {
  let root = mat(M4.T(e.x, 0, e.z), M4.RY(e.yaw));
  const sw = Math.sin(e.anim * 3.2) * (e.state === 'chase' ? 0.35 : 0.1);
  if (e.state === 'dead') root = fallPose(root, e.t / 1.0);
  if (e.state === 'dormant') root = fallPose(root, 1);
  if (e.state === 'rise') root = fallPose(root, 1 - e.t / 1.6);
  let arm = -1.35 + Math.sin(e.anim * 1.7) * 0.12;
  if (e.state === 'attack') arm = -1.6 + Math.sin(clamp(e.t / 0.6, 0, 1) * Math.PI) * 0.5;
  const stagger = e.state === 'stagger' ? -0.35 : 0;
  const v = e.variant !== undefined ? e.variant : (e.variant = Math.floor(Math.random() * 3));
  const shirts = [[0.3, 0.32, 0.26], [0.34, 0.22, 0.2], [0.22, 0.24, 0.3]];
  drawHumanoid(root, {
    skin: [0.45, 0.5, 0.4], hair: [0.12, 0.1, 0.08], shirt: shirts[v], pants: [0.2, 0.18, 0.16],
    legL: sw, legR: -sw, armL: arm, armR: arm + 0.15, armLz: 0.05, armRz: -0.05,
    lean: 0.28 + stagger, headTilt: 0.35 * Math.sin(e.anim * 0.7 + v), headNod: 0.2,
    eyes: [0.8, 0.8, 0.55], mouth: [0.25, 0.02, 0.02], wound: true,
  });
}

function drawDog(e) {
  let root = mat(M4.T(e.x, 0, e.z), M4.RY(e.yaw));
  if (e.state === 'dead') { const k = smooth(e.t / 0.5); root = mat(root, M4.T(0, -0.3 * k, 0), M4.RZ(Math.PI / 2 * k)); }
  const run = e.state === 'chase' || e.state === 'attack';
  const sw = Math.sin(e.anim * (run ? 14 : 3)) * (run ? 0.7 : 0.1);
  const fur = [0.22, 0.13, 0.1], flesh = [0.5, 0.08, 0.06];
  const body = e.state === 'attack' && e.t < 0.45 ? mat(root, M4.T(0, 0.15, 0), M4.RX(-0.25)) : root;
  part(body, 0, 0.58, 0, 0.3, 0.3, 0.85, fur);
  part(body, 0.151, 0.6, 0.1, 0.01, 0.16, 0.34, flesh, MAT.PLAIN);
  part(body, -0.151, 0.55, -0.15, 0.01, 0.12, 0.2, flesh, MAT.PLAIN);
  part(body, 0, 0.74, -0.2, 0.12, 0.02, 0.4, [0.8, 0.78, 0.7], MAT.PLAIN); // exposed ribs
  const head = mat(body, M4.T(0, 0.68, 0.45), M4.RX(e.state === 'attack' ? -0.3 : 0.15));
  part(head, 0, 0.05, 0.1, 0.24, 0.22, 0.24, fur);
  part(head, 0, -0.02, 0.28, 0.14, 0.12, 0.18, flesh, MAT.PLAIN);
  part(head, 0.07, 0.19, 0.03, 0.05, 0.1, 0.05, fur);
  part(head, -0.07, 0.19, 0.03, 0.05, 0.1, 0.05, fur);
  part(head, 0.07, 0.09, 0.221, 0.04, 0.03, 0.01, [1, 0.2, 0.1], MAT.EMIT);
  part(head, -0.07, 0.09, 0.221, 0.04, 0.03, 0.01, [1, 0.2, 0.1], MAT.EMIT);
  for (const [x, z, ph] of [[0.1, 0.3, 0], [-0.1, 0.3, Math.PI], [0.1, -0.3, Math.PI], [-0.1, -0.3, 0]]) {
    const leg = mat(body, M4.T(x, 0.46, z), M4.RX(Math.sin(e.anim * (run ? 14 : 3) + ph) * (run ? 0.7 : 0.1)));
    part(leg, 0, -0.22, 0, 0.08, 0.46, 0.08, fur);
  }
  part(mat(body, M4.T(0, 0.66, -0.42), M4.RX(0.8 + sw * 0.3)), 0, 0, -0.15, 0.05, 0.05, 0.3, fur);
}

function drawBoss(e) {
  let root = mat(M4.T(e.x, 0, e.z), M4.RY(e.yaw));
  if (e.state === 'dead') root = fallPose(root, e.t / 1.4);
  root = mat(root, M4.S(1.4));
  const walk = e.state === 'chase';
  const sw = Math.sin(e.anim * 2.6) * (walk ? 0.35 : 0.05);
  let armR = -0.2 + sw * 0.4;
  if (e.state === 'attack') {
    const d = ENEMY_DEF.boss;
    armR = e.t < d.windup ? lerp(-0.2, -2.8, e.t / d.windup) : lerp(-2.8, -0.4, clamp((e.t - d.windup) / 0.2, 0, 1));
  }
  drawHumanoid(root, {
    skin: [0.62, 0.56, 0.55], hair: [0.5, 0.45, 0.45], shirt: [0.1, 0.1, 0.12], pants: [0.1, 0.1, 0.12],
    legL: sw, legR: -sw, armL: -sw * 0.4, armR, lean: e.state === 'stagger' ? -0.2 : 0.12,
    eyes: [1, 0.9, 0.7], mouth: [0.15, 0.02, 0.02], claw: true,
  });
  // Pulsing exposed heart.
  const pulse = 1 + 0.15 * Math.sin(e.anim * 8);
  part(mat(root, M4.T(0.1, 1.33, 0.14)), 0, 0, 0, 0.12 * pulse, 0.12 * pulse, 0.03, [0.9, 0.15, 0.1], MAT.EMIT);
}

function drawEnemy(e) {
  if (e.type === 'zombie') drawZombie(e);
  else if (e.type === 'dog') drawDog(e);
  else drawBoss(e);
}

function drawItem(it, t) {
  const bob = Math.sin(t * 2 + it.id) * 0.02;
  const base = mat(M4.T(it.x, it.y + 0.01, it.z), M4.RY(it.id * 1.3));
  switch (it.type) {
    case 'herb':
      part(base, 0, 0.09, 0, 0.2, 0.18, 0.2, [0.45, 0.25, 0.15], MAT.PLAIN);
      for (let i = 0; i < 4; i++) part(mat(base, M4.RY(i * 1.57), M4.RX(0.5)), 0, 0.24, 0.07, 0.1, 0.02, 0.22, [0.15, 0.55, 0.12], MAT.PLAIN);
      break;
    case 'ammo': part(base, 0, 0.06, 0, 0.22, 0.12, 0.14, [0.55, 0.5, 0.3], MAT.PLAIN); part(base, 0, 0.06, 0.071, 0.14, 0.06, 0.005, [0.8, 0.1, 0.1], MAT.PLAIN); break;
    case 'shells': part(base, 0, 0.06, 0, 0.2, 0.12, 0.14, [0.6, 0.1, 0.08], MAT.PLAIN); part(base, 0, 0.06, 0.071, 0.12, 0.05, 0.005, [0.9, 0.8, 0.3], MAT.PLAIN); break;
    case 'shotgun': part(base, 0, 0.05, 0, 0.08, 0.08, 0.9, [0.12, 0.12, 0.13], MAT.METAL); part(base, 0, 0.05, -0.45, 0.08, 0.12, 0.3, [0.35, 0.2, 0.1], MAT.WOOD); break;
    case 'note': part(base, 0, 0.005, 0, 0.3, 0.01, 0.4, [0.85, 0.82, 0.72], MAT.PLAIN); break;
    default: { // keys
      const c = it.type === 'key_main' ? [0.95, 0.75, 0.3] : it.type === 'key_shield' ? [0.7, 0.72, 0.75] : [0.85, 0.65, 0.25];
      part(base, 0, 0.02, 0, 0.04, 0.03, 0.24, c, MAT.PLAIN);
      part(base, 0, 0.02, -0.14, 0.12, 0.03, 0.08, c, MAT.PLAIN);
      part(base, 0.03, 0.02, 0.1, 0.05, 0.03, 0.03, c, MAT.PLAIN);
    }
  }
  const blink = 0.5 + 0.5 * Math.sin(t * 5 + it.id * 2);
  R.box(mat(M4.T(it.x, it.y + 0.35 + bob, it.z), M4.RY(t * 2), M4.RX(0.78), M4.S(0.035 + 0.03 * blink)), [1, 0.95, 0.8], MAT.EMIT);
}
