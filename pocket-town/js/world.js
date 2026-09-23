'use strict';
// The town: backgrounds, buildings and interactive furniture.
const WORLD_W = 5000, GROUND = 800, VIEW_H = 900;

const PLACES = [
  { key: 'park', name: 'こうえん', icon: '🌳', x: 650 },
  { key: 'house', name: 'おうち', icon: '🏠', x: 2050 },
  { key: 'cafe', name: 'カフェ', icon: '☕', x: 3300 },
  { key: 'shop', name: 'ようふくや', icon: '👗', x: 4400 },
];

// Ceilings stop floating balloons: [x0, x1, y].
const CEILINGS = [[1420, 2680, 520], [1420, 2680, 240], [2820, 3780, 390], [3920, 4880, 390]];
// Floors characters and items rest on.
const FLOORS = [[0, WORLD_W, GROUND], [1420, 2680, 500]];
// Rooms that go dark when their ceiling light is switched off.
const ROOMS = [
  { x0: 1420, y0: 520, x1: 2044, y1: 800, light: 'l_kitchen' },
  { x0: 2056, y0: 520, x1: 2680, y1: 800, light: 'l_living' },
  { x0: 1420, y0: 240, x1: 2044, y1: 500, light: 'l_bed' },
  { x0: 2056, y0: 240, x1: 2680, y1: 500, light: 'l_bath' },
  { x0: 2820, y0: 390, x1: 3780, y1: 800, light: 'l_cafe' },
  { x0: 3920, y0: 390, x1: 4880, y1: 800, light: 'l_shop' },
];

// ------------------------------------------------------------------ furniture types
// draw(c, f, t, pass): pass is 'back' (behind characters) or 'front' (in front of them).
const FT = {
  tree: {
    box: (f) => [f.x - 140, f.y - 420, f.x + 140, f.y - 240],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const s = (f.st.shake || 0) > 0 ? Math.sin(t * 60) * 6 * f.st.shake : 0;
      fRR(c, f.x - 22, f.y - 260, 44, 260, 16, '#b07a4f');
      line(c, f.x, f.y - 180, f.x + 50, f.y - 240, 16, '#b07a4f');
      c.save(); c.translate(s, 0);
      for (const [dx, dy, r, col] of [[-80, -300, 80, '#6cc56a'], [70, -310, 85, '#6cc56a'], [0, -380, 100, '#7fd67a'], [-40, -320, 70, '#8ee08a'], [50, -360, 60, '#8ee08a']]) fC(c, f.x + dx, f.y + dy, r, col);
      for (const [dx, dy] of [[-70, -330], [40, -290], [90, -340], [-10, -420], [-100, -280]]) fC(c, f.x + dx, f.y + dy, 11, '#ff5d5d');
      c.restore();
    },
    tap(f) { f.st.shake = 0.5; Sfx.rustle(); if (countItems('apple') < 12) spawnItem('apple', f.x + rand(-90, 90), f.y - 300, { vx: rand(-40, 40) }); },
  },
  slide: {
    seats: (f) => [{ x: f.x - 45, y: f.y - 222, kind: 'slide', sx: f.x - 45, sy: f.y - 260 }],
    surf: (f) => [[f.x - 70, f.x - 20, f.y - 222]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const x = f.x;
      for (const dx of [-70, -20]) fRR(c, x + dx - 5, f.y - 222, 10, 222, 5, '#7fb6ff');
      for (let y = f.y - 190; y < f.y; y += 38) fRR(c, x - 70, y, 50, 7, 3, '#7fb6ff');
      fRR(c, x - 76, f.y - 230, 62, 14, 7, '#5d97e8');
      c.beginPath(); c.moveTo(x - 20, f.y - 226); c.bezierCurveTo(x + 60, f.y - 220, x + 90, f.y - 20, x + 190, f.y - 18);
      c.lineTo(x + 190, f.y - 2); c.bezierCurveTo(x + 80, f.y - 4, x + 50, f.y - 200, x - 20, f.y - 206); c.closePath();
      c.fillStyle = '#ffb870'; c.fill();
      line(c, x + 180, f.y - 10, x + 180, f.y, 8, '#5d97e8');
    },
  },
  swing: {
    seats: (f) => [{ x: f.x, y: f.y - 90, kind: 'swing', sx: f.x, sy: f.y - 120 }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const top = f.y - 290;
      line(c, f.x - 90, f.y, f.x - 70, top, 12, '#ff8f8f'); line(c, f.x + 90, f.y, f.x + 70, top, 12, '#ff8f8f');
      line(c, f.x - 80, top, f.x + 80, top, 12, '#ff6b6b');
      c.save(); c.translate(f.x, top); c.rotate(f.st.a || 0);
      line(c, -34, 0, -34, 200, 3, '#8a6a50'); line(c, 34, 0, 34, 200, 3, '#8a6a50');
      fRR(c, -42, 196, 84, 12, 6, '#ffd36e');
      c.restore();
    },
  },
  bench: {
    seats: (f) => [{ x: f.x - 45, y: f.y - 60, kind: 'sit' }, { x: f.x + 45, y: f.y - 60, kind: 'sit' }],
    surf: (f) => [[f.x - 90, f.x + 90, f.y - 60]],
    draw(c, f, t, pass) {
      if (pass === 'back') {
        fRR(c, f.x - 95, f.y - 130, 190, 16, 8, '#c98a5c'); fRR(c, f.x - 95, f.y - 105, 190, 16, 8, '#c98a5c');
        return;
      }
      fRR(c, f.x - 100, f.y - 66, 200, 16, 8, '#d99a66');
      fRR(c, f.x - 85, f.y - 52, 12, 52, 4, '#8a6a50'); fRR(c, f.x + 73, f.y - 52, 12, 52, 4, '#8a6a50');
    },
  },
  icecart: {
    box: (f) => [f.x - 70, f.y - 200, f.x + 70, f.y],
    surf: (f) => [[f.x - 60, f.x + 60, f.y - 100]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      line(c, f.x + 40, f.y - 100, f.x + 40, f.y - 210, 5, '#aaa');
      c.beginPath(); c.moveTo(f.x - 50, f.y - 200); c.quadraticCurveTo(f.x + 40, f.y - 270, f.x + 130, f.y - 200); c.closePath(); c.fillStyle = '#ff9fd0'; c.fill();
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(f.x + 40, f.y - 236); c.lineTo(f.x - 50 + i * 60 + 20, f.y - 200); c.lineTo(f.x - 50 + i * 60 + 40, f.y - 200); c.closePath(); c.fillStyle = '#fff'; c.fill(); }
      fRR(c, f.x - 64, f.y - 100, 128, 70, 12, '#fff6d6');
      fRR(c, f.x - 64, f.y - 70, 128, 12, 0, '#ff9fd0');
      fC(c, f.x - 40, f.y - 20, 18, '#5d667c'); fC(c, f.x + 40, f.y - 20, 18, '#5d667c'); fC(c, f.x - 40, f.y - 20, 7, '#ddd'); fC(c, f.x + 40, f.y - 20, 7, '#ddd');
      drawItem(c, { k: 'icecream', x: f.x - 18, y: f.y - 100, id: 0, col: '#9ee37f' }, t);
    },
    tap(f) { Sfx.pop(1.3); if (countItems('icecream') < 10) spawnItem('icecream', f.x, f.y - 120, { vy: -420, vx: rand(-80, 80), col: pick(['#ffb3d1', '#9ee37f', '#fff3c4', '#b99dff', '#8a5a3b']) }); },
  },
  lamppost: {
    lights: (f) => [{ x: f.x, y: f.y - 250, r: 260, on: true }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 6, f.y - 250, 12, 250, 6, '#5d667c');
      fRR(c, f.x - 20, f.y - 280, 40, 36, 10, G.night ? '#fff3b0' : '#e8eef8');
      fRR(c, f.x - 24, f.y - 286, 48, 10, 5, '#5d667c');
    },
  },
  trash: {
    trash: true,
    box: (f) => [f.x - 30, f.y - 76, f.x + 30, f.y],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const open = (f.st.chomp || 0) > 0;
      fRR(c, f.x - 26, f.y - 64, 52, 64, [4, 4, 10, 10], '#7fcf9a');
      for (const dx of [-12, 0, 12]) fRR(c, f.x + dx - 2, f.y - 54, 4, 44, 2, '#63b582');
      c.save(); c.translate(f.x - 30, f.y - 64); c.rotate(open ? -0.6 : 0); fRR(c, 0, -10, 60, 12, 6, '#63b582'); fRR(c, 22, -18, 16, 10, 5, '#63b582'); c.restore();
    },
    tap(f) { f.st.chomp = 0.3; Sfx.click(); },
  },

  // ---------------------------------------------------------------- house
  fridge: {
    box: (f) => [f.x - 60, f.y - 240, f.x + 60, f.y],
    cont: (f) => ({ x0: f.x - 55, y0: f.y - 232, x1: f.x + 55, y1: f.y - 8, open: f.st.open }),
    surf: (f) => [[f.x - 60, f.x + 60, f.y - 240], [f.x - 52, f.x + 52, f.y - 160], [f.x - 52, f.x + 52, f.y - 85], [f.x - 52, f.x + 52, f.y - 10]],
    lights: (f) => [{ x: f.x, y: f.y - 120, r: 170, on: f.st.open }],
    draw(c, f, t, pass) {
      const x = f.x - 60, y = f.y - 240;
      if (pass === 'back') {
        fRR(c, x, y, 120, 240, 16, '#e9f4ff');
        if (f.st.open) {
          fRR(c, x + 6, y + 8, 108, 226, 10, '#fdfdff');
          for (const sy of [80, 155]) fRR(c, x + 8, y + sy, 104, 5, 2, '#cfe3f5');
        } else {
          fRR(c, x + 4, y + 4, 112, 232, 14, '#f4faff');
          fRR(c, x + 4, y + 88, 112, 4, 0, '#d6e6f5');
          fRR(c, x + 96, y + 30, 8, 40, 4, '#b8cde0'); fRR(c, x + 96, y + 110, 8, 60, 4, '#b8cde0');
          fC(c, x + 30, y + 40, 9, '#ff8f8f'); star(c, x + 60, y + 150, 10, '#ffe066');
        }
        return;
      }
      if (f.st.open) {
        c.beginPath(); c.moveTo(x + 120, y + 4); c.lineTo(x + 150, y - 10); c.lineTo(x + 150, y + 250); c.lineTo(x + 120, y + 236); c.closePath(); c.fillStyle = '#dbe9f7'; c.fill();
      }
    },
    tap(f) { f.st.open = !f.st.open; Sfx.door(f.st.open); },
  },
  counter: {
    box: (f) => [f.x - 30, f.y - 190, f.x + 40, f.y - 110],
    surf: (f) => [[f.x - 110, f.x + 110, f.y - 110]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const x = f.x - 110;
      fRR(c, x, f.y - 110, 220, 110, 6, '#ffd9b3');
      for (const dx of [8, 114]) { fRR(c, x + dx, f.y - 96, 98, 88, 8, '#ffe6cc'); fC(c, x + dx + 49, f.y - 80, 5, '#c98a5c'); }
      fRR(c, x - 6, f.y - 118, 232, 14, 6, '#e8eef8');
      fRR(c, f.x - 40, f.y - 116, 80, 6, 3, '#b8cde0');
      line(c, f.x + 20, f.y - 118, f.x + 20, f.y - 160, 7, '#b8cde0'); line(c, f.x + 20, f.y - 160, f.x, f.y - 160, 7, '#b8cde0');
      fRR(c, f.x + 14, f.y - 140, 12, 8, 3, '#8fa6bd');
      if (f.st.on) { c.fillStyle = 'rgba(127,200,255,.75)'; c.fillRect(f.x - 3, f.y - 158, 6, 42); }
    },
    tap(f) { f.st.on = !f.st.on; Sfx.water(f.st.on, 'sink'); },
  },
  stove: {
    box: (f) => [f.x - 50, f.y - 110, f.x + 50, f.y],
    surf: (f) => [[f.x - 50, f.x + 50, f.y - 110]],
    lights: (f) => [{ x: f.x, y: f.y - 115, r: 90, on: f.st.on }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 50, f.y - 110, 100, 110, 8, '#ff9f8f');
      fRR(c, f.x - 38, f.y - 80, 76, 60, 8, '#5d667c'); fRR(c, f.x - 30, f.y - 72, 60, 30, 5, f.st.on ? '#ffb070' : '#7d879c');
      fRR(c, f.x - 30, f.y - 94, 60, 6, 3, '#e8eef8');
      fRR(c, f.x - 54, f.y - 116, 108, 10, 5, '#5d667c');
      for (const dx of [-24, 24]) { fE(c, f.x + dx, f.y - 116, 16, 3, '#333'); if (f.st.on) fE(c, f.x + dx, f.y - 119, 13, 4, `rgba(255,${120 + Math.sin(t * 20 + dx) * 40},40,.9)`); }
    },
    tap(f) { f.st.on = !f.st.on; Sfx.click(); Sfx.sizzle(f.st.on); },
  },
  clight: {
    box: (f) => [f.x - 40, f.y, f.x + 40, f.y + 70],
    lights: (f) => [{ x: f.x, y: f.y + 70, r: 420, on: f.st.on !== false }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      line(c, f.x, f.y, f.x, f.y + 40, 3, '#8a7a6a');
      c.beginPath(); c.moveTo(f.x - 36, f.y + 64); c.quadraticCurveTo(f.x, f.y + 20, f.x + 36, f.y + 64); c.closePath(); c.fillStyle = f.col || '#ffd36e'; c.fill();
      fE(c, f.x, f.y + 66, 14, 7, f.st.on !== false ? '#fff8c4' : '#d8d2c0');
    },
    tap(f) { f.st.on = f.st.on === false; Sfx.click(); },
  },
  sofa: {
    seats: (f) => [-70, 0, 70].map((dx) => ({ x: f.x + dx, y: f.y - 76, kind: 'sit' })),
    surf: (f) => [[f.x - 120, f.x + 120, f.y - 76]],
    draw(c, f, t, pass) {
      if (pass === 'back') { fRR(c, f.x - 125, f.y - 170, 250, 110, 30, '#ff8fb1'); return; }
      fRR(c, f.x - 130, f.y - 82, 260, 50, 18, '#ffa3c0');
      fRR(c, f.x - 150, f.y - 120, 40, 96, 18, '#ff8fb1'); fRR(c, f.x + 110, f.y - 120, 40, 96, 18, '#ff8fb1');
      fRR(c, f.x - 120, f.y - 34, 12, 34, 4, '#b06a50'); fRR(c, f.x + 108, f.y - 34, 12, 34, 4, '#b06a50');
    },
  },
  tvcab: {
    box: (f) => [f.x - 20, f.y - 200, f.x + 110, f.y - 90],
    surf: (f) => [[f.x - 110, f.x + 110, f.y - 90]],
    lights: (f) => [{ x: f.x + 45, y: f.y - 145, r: 200, on: f.st.on }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 110, f.y - 90, 220, 90, 10, '#c9a0ff');
      for (const dx of [-100, 5]) fRR(c, f.x + dx, f.y - 78, 95, 66, 8, '#d9b8ff');
      const tx = f.x - 20, ty = f.y - 200;
      fRR(c, tx + 50, ty + 100, 30, 10, 3, '#5d667c');
      fRR(c, tx, ty, 130, 100, 14, '#5d667c');
      if (f.st.on) {
        c.save(); rr(c, tx + 8, ty + 8, 114, 84, 8); c.clip();
        c.fillStyle = `hsl(${(t * 40) % 360},80%,75%)`; c.fillRect(tx, ty, 130, 100);
        fC(c, tx + 65 + Math.sin(t * 3) * 35, ty + 60 - Math.abs(Math.sin(t * 5)) * 30, 14, '#fff');
        fRR(c, tx, ty + 78, 130, 30, 0, '#9ee37f');
        c.restore();
      } else fRR(c, tx + 8, ty + 8, 114, 84, 8, '#2d3142');
    },
    tap(f) { f.st.on = !f.st.on; Sfx.click(); Sfx.tv(f.st.on); },
  },
  radio: {
    box: (f) => [f.x - 36, f.y - 60, f.x + 36, f.y],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      const b = f.st.on ? Math.abs(Math.sin(t * 8)) * 3 : 0;
      line(c, f.x + 18, f.y - 50, f.x + 34, f.y - 80, 3, '#888');
      fRR(c, f.x - 34 - b / 2, f.y - 52 - b, 68 + b, 52 + b, 12, '#ffb870');
      fC(c, f.x - 12, f.y - 26, 14, '#8a5a3b'); fC(c, f.x - 12, f.y - 26, 6 + b, '#6b4226');
      fRR(c, f.x + 6, f.y - 42, 20, 8, 3, '#fff6d6'); fC(c, f.x + 16, f.y - 18, 6, '#6b4226');
    },
    tap(f) { f.st.on = !f.st.on; Sfx.click(); Music.set(f.id, f.st.on); },
  },
  flamp: {
    box: (f) => [f.x - 40, f.y - 250, f.x + 40, f.y],
    lights: (f) => [{ x: f.x, y: f.y - 200, r: 240, on: f.st.on }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fE(c, f.x, f.y - 6, 30, 8, '#7d879c'); line(c, f.x, f.y, f.x, f.y - 200, 6, '#7d879c');
      fPoly(c, [f.x - 38, f.y - 190, f.x + 38, f.y - 190, f.x + 24, f.y - 250, f.x - 24, f.y - 250], f.st.on ? '#fff3b0' : '#ffd36e');
    },
    tap(f) { f.st.on = !f.st.on; Sfx.click(); },
  },
  bed: {
    seats: (f) => [{ x: f.x + 85, y: f.y - 92, kind: 'lie', sx: f.x, sy: f.y - 110 }],
    surf: (f) => [[f.x - 120, f.x + 120, f.y - 62]],
    draw(c, f, t, pass) {
      if (pass === 'back') {
        fRR(c, f.x - 130, f.y - 150, 30, 150, 12, '#9ec5ff');
        fRR(c, f.x + 104, f.y - 100, 26, 100, 12, '#9ec5ff');
        fRR(c, f.x - 110, f.y - 70, 220, 40, 12, '#ffffff');
        fRR(c, f.x - 104, f.y - 96, 70, 30, 14, '#fff6d6');
        fRR(c, f.x - 110, f.y - 34, 220, 20, 6, '#7fa8e8');
        return;
      }
      c.beginPath(); c.moveTo(f.x - 30, f.y - 74); c.quadraticCurveTo(f.x + 40, f.y - 84, f.x + 112, f.y - 74);
      c.lineTo(f.x + 112, f.y - 26); c.lineTo(f.x - 30, f.y - 26); c.closePath(); c.fillStyle = '#b99dff'; c.fill();
      for (let x = f.x - 16; x < f.x + 104; x += 30) fC(c, x, f.y - 50, 5, '#e6dcff');
      fRR(c, f.x - 30, f.y - 78, 142, 12, 6, '#d6c8ff');
    },
  },
  wardrobe: {
    box: (f) => [f.x - 65, f.y - 240, f.x + 65, f.y],
    cont: (f) => ({ x0: f.x - 58, y0: f.y - 232, x1: f.x + 58, y1: f.y - 8, open: f.st.open }),
    surf: (f) => [[f.x - 65, f.x + 65, f.y - 240], [f.x - 56, f.x + 56, f.y - 165], [f.x - 56, f.x + 56, f.y - 90], [f.x - 56, f.x + 56, f.y - 10]],
    draw(c, f, t, pass) {
      const x = f.x - 65, y = f.y - 240;
      if (pass === 'back') {
        fRR(c, x, y, 130, 240, 10, '#e2a878');
        if (f.st.open) {
          fRR(c, x + 7, y + 8, 116, 226, 6, '#b97e52');
          for (const sy of [75, 150]) fRR(c, x + 6, y + sy, 118, 6, 2, '#e2a878');
        } else {
          fRR(c, x + 6, y + 6, 57, 228, 6, '#f0bb8c'); fRR(c, x + 67, y + 6, 57, 228, 6, '#f0bb8c');
          fC(c, x + 55, y + 120, 5, '#8a5a3b'); fC(c, x + 75, y + 120, 5, '#8a5a3b');
          heart(c, x + 34, y + 60, 12, '#ffa3c0'); heart(c, x + 96, y + 60, 12, '#ffa3c0');
        }
        return;
      }
      if (f.st.open) { fPoly(c, [x, y + 6, x - 36, y - 6, x - 36, y + 246, x, y + 234], '#f0bb8c'); fPoly(c, [x + 130, y + 6, x + 166, y - 6, x + 166, y + 246, x + 130, y + 234], '#f0bb8c'); }
    },
    tap(f) { f.st.open = !f.st.open; Sfx.door(f.st.open); },
  },
  desk: {
    surf: (f) => [[f.x - 70, f.x + 70, f.y - 80]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 75, f.y - 86, 150, 14, 6, '#ffd36e');
      fRR(c, f.x - 66, f.y - 74, 10, 74, 4, '#e8b04a'); fRR(c, f.x + 56, f.y - 74, 10, 74, 4, '#e8b04a');
      fRR(c, f.x - 50, f.y - 72, 60, 26, 5, '#ffe29a');
    },
  },
  dlamp: {
    box: (f) => [f.x - 30, f.y - 80, f.x + 30, f.y],
    lights: (f) => [{ x: f.x - 10, y: f.y - 50, r: 160, on: f.st.on }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fE(c, f.x, f.y - 3, 18, 5, '#7fb6ff'); line(c, f.x, f.y, f.x + 6, f.y - 50, 5, '#7fb6ff'); line(c, f.x + 6, f.y - 50, f.x - 10, f.y - 64, 5, '#7fb6ff');
      fPoly(c, [f.x - 32, f.y - 46, f.x - 4, f.y - 46, f.x - 10, f.y - 74, f.x - 26, f.y - 74], f.st.on ? '#fff3b0' : '#7fb6ff');
    },
    tap(f) { f.st.on = !f.st.on; Sfx.click(); },
  },
  tub: {
    seats: (f) => [{ x: f.x, y: f.y - 40, kind: 'bath', sx: f.x, sy: f.y - 100 }],
    surf: (f) => [[f.x - 100, f.x + 100, f.y - 60]],
    box: (f) => [f.x + 70, f.y - 180, f.x + 120, f.y - 90],
    draw(c, f, t, pass) {
      if (pass === 'back') {
        line(c, f.x + 96, f.y - 90, f.x + 96, f.y - 170, 6, '#b8cde0'); line(c, f.x + 96, f.y - 170, f.x + 70, f.y - 170, 6, '#b8cde0');
        if (f.st.on) { c.fillStyle = 'rgba(127,200,255,.7)'; c.fillRect(f.x + 66, f.y - 168, 8, 90); }
        fRR(c, f.x - 110, f.y - 96, 220, 20, 10, '#9fd8ff');
        return;
      }
      fRR(c, f.x - 115, f.y - 90, 230, 76, [20, 20, 40, 40], '#ffffff');
      fRR(c, f.x - 115, f.y - 94, 230, 14, 7, '#e8f4ff');
      for (const dx of [-80, 80]) fRR(c, f.x + dx - 8, f.y - 20, 16, 20, 6, '#ffd36e');
      if (seatUser(f.id, 0)) for (let i = 0; i < 7; i++) fC(c, f.x - 90 + i * 30, f.y - 92 + Math.sin(t * 2 + i) * 3, 16, 'rgba(255,255,255,.95)');
    },
    tap(f) { f.st.on = !f.st.on; Sfx.water(f.st.on, 'tub'); },
  },
  toilet: {
    seats: (f) => [{ x: f.x, y: f.y - 56, kind: 'sit' }],
    box: (f) => [f.x - 10, f.y - 150, f.x + 50, f.y - 70],
    draw(c, f, t, pass) {
      if (pass === 'back') { fRR(c, f.x - 6, f.y - 150, 56, 80, 10, '#ffffff'); fRR(c, f.x + 30, f.y - 140, 14, 6, 3, '#b8cde0'); return; }
      fRR(c, f.x - 44, f.y - 62, 88, 16, 8, '#e8f4ff');
      fPoly(c, [f.x - 36, f.y - 48, f.x + 36, f.y - 48, f.x + 22, f.y, f.x - 22, f.y], '#ffffff');
    },
    tap(f) { Sfx.flush(); for (let i = 0; i < 8; i++) addParticle('bubble', f.x + rand(-30, 30), f.y - 60, { vy: rand(-80, -30), vx: rand(-20, 20) }); },
  },
  bsink: {
    box: (f) => [f.x - 20, f.y - 150, f.x + 20, f.y - 110],
    surf: (f) => [[f.x - 55, f.x + 55, f.y - 100]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 44, f.y - 250, 88, 110, 40, '#e8f4ff'); fRR(c, f.x - 36, f.y - 242, 72, 94, 34, '#c4e6ff');
      line(c, f.x - 20, f.y - 225, f.x - 4, f.y - 240, 5, 'rgba(255,255,255,.8)');
      fRR(c, f.x - 12, f.y - 100, 24, 100, 6, '#ffffff');
      fRR(c, f.x - 58, f.y - 112, 116, 22, [4, 4, 20, 20], '#ffffff');
      line(c, f.x, f.y - 112, f.x, f.y - 140, 6, '#b8cde0'); line(c, f.x, f.y - 140, f.x - 14, f.y - 140, 6, '#b8cde0');
      if (f.st.on) { c.fillStyle = 'rgba(127,200,255,.75)'; c.fillRect(f.x - 16, f.y - 138, 5, 26); }
    },
    tap(f) { f.st.on = !f.st.on; Sfx.water(f.st.on, 'bsink'); },
  },

  // ---------------------------------------------------------------- cafe
  ccounter: {
    surf: (f) => [[f.x - 160, f.x + 160, f.y - 110]],
    draw(c, f, t, pass) {
      if (pass !== 'front') return;
      fRR(c, f.x - 160, f.y - 110, 320, 110, 8, '#c98a5c');
      for (let x = f.x - 150; x < f.x + 150; x += 40) fRR(c, x, f.y - 96, 30, 86, 6, '#d99a66');
      fRR(c, f.x - 170, f.y - 118, 340, 16, 8, '#ffe6cc');
    },
  },
  coffee: {
    box: (f) => [f.x - 40, f.y - 100, f.x + 40, f.y],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 36, f.y - 96, 72, 96, 12, '#e5594c'); fRR(c, f.x - 26, f.y - 60, 52, 44, 6, '#3d3a4a');
      fRR(c, f.x - 8, f.y - 60, 16, 12, 3, '#aaa'); fC(c, f.x + 18, f.y - 80, 6, '#ffe27a'); fC(c, f.x - 16, f.y - 80, 6, '#9ee37f');
    },
    tap(f) { Sfx.pop(1.1); if (countItems('coffee') < 10) spawnItem('coffee', f.x, f.y - 10, { vy: -120 }); addParticle('steam', f.x, f.y - 70, { vy: -40 }); },
  },
  display: {
    box: (f) => [f.x - 85, f.y - 90, f.x + 85, f.y],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 85, f.y - 90, 170, 90, 12, 'rgba(220,240,255,.8)');
      fRR(c, f.x - 80, f.y - 46, 160, 5, 2, '#ffffff');
      const k = ['cake', 'donut', 'cupcake', 'croissant', 'cookie'];
      k.forEach((kk, i) => drawItem(c, { k: kk, x: f.x - 60 + i * 30, y: i % 2 ? f.y - 6 : f.y - 48, id: i, col: '#ff8fc8' }, 0));
      fRR(c, f.x - 85, f.y - 94, 170, 8, 4, '#ffe6cc');
      line(c, f.x - 60, f.y - 80, f.x - 40, f.y - 60, 4, 'rgba(255,255,255,.8)');
    },
    tap(f) { Sfx.pop(1.2); if (countItems() < 160) spawnItem(pick(['cake', 'donut', 'cupcake', 'croissant', 'cookie']), f.x + rand(-40, 40), f.y - 100, { vy: -380, vx: rand(-90, 90), col: pick(['#ff8fc8', '#7fd6ff', '#fff3c4', '#8a5a3b']) }); },
  },
  oven: {
    box: (f) => [f.x - 60, f.y - 190, f.x + 60, f.y],
    lights: (f) => [{ x: f.x, y: f.y - 70, r: 120, on: (f.st.bake || 0) > 0 }],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 60, f.y - 190, 120, 190, 14, '#b8cde0');
      fRR(c, f.x - 46, f.y - 120, 92, 90, 10, '#3d3a4a');
      fRR(c, f.x - 38, f.y - 112, 76, 74, 8, (f.st.bake || 0) > 0 ? '#ffb070' : '#5d667c');
      fRR(c, f.x - 40, f.y - 140, 80, 10, 5, '#e8eef8');
      for (const dx of [-30, 0, 30]) fC(c, f.x + dx, f.y - 168, 8, '#7d879c');
    },
    tap(f) {
      if ((f.st.bake || 0) > 0) return;
      f.st.bake = 1.2; Sfx.click();
      setTimeout(() => { Sfx.ding(); spawnItem(pick(['bread', 'pizza', 'croissant']), f.x, f.y - 60, { vy: -300, vx: rand(80, 160) }); }, 1200);
    },
  },
  ctable: {
    surf: (f) => [[f.x - 70, f.x + 70, f.y - 110]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 8, f.y - 104, 16, 104, 6, '#7d879c'); fE(c, f.x, f.y - 4, 34, 7, '#7d879c');
      fRR(c, f.x - 75, f.y - 116, 150, 14, 7, '#ffffff'); fRR(c, f.x - 75, f.y - 106, 150, 6, 3, '#ffa3c0');
    },
  },
  chair: {
    seats: (f) => [{ x: f.x, y: f.y - 66, kind: 'sit' }],
    draw(c, f, t, pass) {
      const col = f.col || '#7fd6ff';
      if (pass === 'back') { fRR(c, f.x - 34, f.y - 160, 68, 90, 18, col); return; }
      fRR(c, f.x - 38, f.y - 72, 76, 16, 8, shade(col, -0.1));
      fRR(c, f.x - 32, f.y - 58, 8, 58, 4, shade(col, -0.3)); fRR(c, f.x + 24, f.y - 58, 8, 58, 4, shade(col, -0.3));
    },
  },

  // ---------------------------------------------------------------- boutique
  shelf: {
    surf: (f) => [[f.x - 90, f.x + 90, f.y - 290], [f.x - 90, f.x + 90, f.y - 200], [f.x - 90, f.x + 90, f.y - 110]],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fRR(c, f.x - 95, f.y - 320, 190, 320, 10, '#f5c2d8');
      fRR(c, f.x - 85, f.y - 310, 170, 300, 6, '#ffe0ee');
      for (const y of [290, 200, 110]) fRR(c, f.x - 95, f.y - y, 190, 10, 4, '#e8a6c4');
    },
  },
  rack: {
    box: (f) => [f.x - 110, f.y - 280, f.x + 110, f.y - 120],
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      line(c, f.x - 110, f.y, f.x - 110, f.y - 270, 7, '#b8a0c8'); line(c, f.x + 110, f.y, f.x + 110, f.y - 270, 7, '#b8a0c8');
      line(c, f.x - 118, f.y - 270, f.x + 118, f.y - 270, 7, '#9d84b0');
      ['#ff8f8f', '#ffe27a', '#7fb6ff', '#9fe07f', '#b99dff', '#ffa3d2'].forEach((col, i) => {
        const x = f.x - 85 + i * 34, sw = Math.sin(t * 2 + i) * 0.03 + (f.st.shake > 0 ? Math.sin(t * 40 + i) * 0.1 : 0);
        c.save(); c.translate(x, f.y - 270); c.rotate(sw);
        line(c, 0, 0, 0, 12, 2, '#888');
        drawItem(c, { k: 'shirt', x: 0, y: 74, id: i, v: { col, style: i % 3 } }, t);
        c.restore();
      });
    },
    tap(f) {
      f.st.shake = 0.4; Sfx.pop(1.0);
      if (countItems() < 160) spawnItem('shirt', f.x + rand(-60, 60), f.y - 200, { vy: -200, vx: rand(-80, 80), v: { col: pick(CLOTH), style: Math.floor(Math.random() * SHIRTSTYLES) } });
    },
  },
  booth: {
    seats: (f) => [{ x: f.x, y: f.y, kind: 'stand', sx: f.x, sy: f.y - 90 }],
    box: (f) => [f.x - 80, f.y - 330, f.x + 80, f.y - 250],
    draw(c, f, t, pass) {
      const cl = f.st.close || 0;
      if (pass === 'back') { fRR(c, f.x - 80, f.y - 320, 160, 320, 10, '#fff0f6'); line(c, f.x - 86, f.y - 300, f.x + 86, f.y - 300, 8, '#d4a0c0'); return; }
      const w = lerp(26, 80, cl);
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? f.x - 80 : f.x + 80 - w;
        fRR(c, x0, f.y - 300, w, 296, 6, '#b99dff');
        for (let x = x0 + 10; x < x0 + w - 4; x += 16) fRR(c, x, f.y - 296, 5, 290, 2, '#a88aee');
      }
      fRR(c, f.x - 60, f.y - 350, 120, 34, 10, '#ff8fc8');
      c.fillStyle = '#fff'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.fillText('きがえ', f.x, f.y - 326); c.textAlign = 'left';
    },
    tap(f) {
      if (f.st.busy) return;
      f.st.busy = true; Sfx.curtain();
      const ch = seatUser(f.id, 0);
      animate(f.st, 'close', 0, 1, 0.35);
      setTimeout(() => {
        if (ch && ch.seat === f.id + ':0') { const L = randomLook(); Object.assign(ch.look, { shirt: L.shirt, shirtStyle: L.shirtStyle, pants: L.pants, shoes: L.shoes, hat: Math.random() < 0.5 ? { k: pick(HATS) } : null, glasses: Math.random() < 0.3 ? pick(GLASSES) : null }); }
        animate(f.st, 'close', 1, 0, 0.35); Sfx.curtain();
        if (ch) { ch.happyT = 1.5; Sfx.sparkle(); for (let i = 0; i < 10; i++) addParticle('spark', f.x + rand(-60, 60), f.y - rand(40, 220), { col: pick(['#ffe066', '#ff8fc8', '#7fd6ff']) }); }
        setTimeout(() => { f.st.busy = false; }, 400);
      }, 1100);
    },
  },
  salon: {
    seats: (f) => [{ x: f.x, y: f.y - 76, kind: 'sit' }],
    box: (f) => [f.x - 70, f.y - 360, f.x + 70, f.y - 200],
    draw(c, f, t, pass) {
      if (pass === 'back') {
        fRR(c, f.x - 70, f.y - 360, 140, 170, 60, '#ffd36e'); fRR(c, f.x - 58, f.y - 348, 116, 146, 52, '#dff4ff');
        line(c, f.x - 30, f.y - 320, f.x - 10, f.y - 340, 6, 'rgba(255,255,255,.9)');
        star(c, f.x + 70, f.y - 360, 14, '#ff8fc8');
        fRR(c, f.x - 40, f.y - 170, 80, 96, 22, '#ff8fb1');
        return;
      }
      fRR(c, f.x - 46, f.y - 84, 92, 18, 9, '#ff6f9c');
      fRR(c, f.x - 6, f.y - 66, 12, 60, 4, '#b8cde0'); fE(c, f.x, f.y - 6, 32, 7, '#b8cde0');
    },
    tap(f) {
      const ch = seatUser(f.id, 0);
      if (!ch) { Sfx.boop(); return; }
      ch.look.hair = (ch.look.hair + 1 + Math.floor(Math.random() * (HAIRSTYLES - 1))) % HAIRSTYLES;
      ch.look.hairColor = pick(HAIRC);
      ch.happyT = 1.2; Sfx.sparkle();
      for (let i = 0; i < 10; i++) addParticle('spark', ch.x + rand(-50, 50), ch.y - rand(80, 180), { col: ch.look.hairColor });
    },
  },
  plant: {
    draw(c, f, t, pass) {
      if (pass !== 'back') return;
      fPoly(c, [f.x - 30, f.y - 60, f.x + 30, f.y - 60, f.x + 22, f.y, f.x - 22, f.y], '#e2805a');
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) fE(c, f.x + Math.sin(a) * 34, f.y - 100 - Math.cos(a) * 16 + Math.sin(t + a) * 2, 12, 36, '#57c26b', a);
    },
  },
};

// ------------------------------------------------------------------ instances
function makeFurniture() {
  const F = [];
  const add = (id, t, x, y, st = {}, extra = {}) => F.push({ id, t, x, y, st, ...extra });
  // park
  add('tree', 'tree', 200, GROUND);
  add('slide', 'slide', 470, GROUND);
  add('swing', 'swing', 820, GROUND, { a: 0 });
  add('bench', 'bench', 1030, GROUND);
  add('icecart', 'icecart', 1190, GROUND);
  add('lamp1', 'lamppost', 1300, GROUND);
  add('trash_park', 'trash', 1350, GROUND);
  // house kitchen
  add('fridge', 'fridge', 1495, GROUND, { open: false });
  add('counter', 'counter', 1690, GROUND);
  add('stove', 'stove', 1860, GROUND);
  add('trash_kitchen', 'trash', 1990, GROUND);
  add('l_kitchen', 'clight', 1730, 520, { on: true });
  // living
  add('sofa', 'sofa', 2230, GROUND);
  add('tvcab', 'tvcab', 2490, GROUND);
  add('radio', 'radio', 2425, GROUND - 90);
  add('flamp', 'flamp', 2635, GROUND);
  add('l_living', 'clight', 2370, 520, { on: true }, { col: '#ff9fd0' });
  // bedroom
  add('bed', 'bed', 1570, 500);
  add('wardrobe', 'wardrobe', 1790, 500, { open: false });
  add('desk', 'desk', 1960, 500);
  add('dlamp', 'dlamp', 2005, 420, { on: false });
  add('l_bed', 'clight', 1730, 240, { on: true }, { col: '#b99dff' });
  // bathroom
  add('tub', 'tub', 2200, 500);
  add('toilet', 'toilet', 2420, 500);
  add('bsink', 'bsink', 2580, 500);
  add('l_bath', 'clight', 2380, 240, { on: true }, { col: '#7fd6ff' });
  // cafe
  add('ccounter', 'ccounter', 3010, GROUND);
  add('coffee', 'coffee', 2900, GROUND - 110);
  add('display', 'display', 3080, GROUND - 110);
  add('oven', 'oven', 3260, GROUND);
  add('trash_cafe', 'trash', 3345, GROUND);
  add('ctable1', 'ctable', 3480, GROUND);
  add('chair1', 'chair', 3405, GROUND, {}, { col: '#7fd6ff' });
  add('chair2', 'chair', 3555, GROUND, {}, { col: '#ffb870' });
  add('ctable2', 'ctable', 3665, GROUND);
  add('chair4', 'chair', 3740, GROUND, {}, { col: '#ffa3d2' });
  add('l_cafe', 'clight', 3150, 390, { on: true }, { col: '#ffb870' });
  add('pend2', 'clight', 3580, 390, { on: true }, { col: '#9fe07f' });
  add('cplant', 'plant', 2850, GROUND);
  // boutique
  add('shelf', 'shelf', 4030, GROUND);
  add('rack', 'rack', 4270, GROUND);
  add('booth', 'booth', 4510, GROUND, { close: 0 });
  add('salon', 'salon', 4720, GROUND);
  add('trash_shop', 'trash', 4845, GROUND);
  add('l_shop', 'clight', 4270, 390, { on: true }, { col: '#ff8fc8' });
  add('pend3', 'clight', 4640, 390, { on: true }, { col: '#b99dff' });
  add('splant', 'plant', 3950, GROUND);
  return F;
}

function initialItems() {
  const I = [];
  const add = (k, x, y, o = {}) => I.push({ k, x, y, ...o });
  // park
  add('ball', 620, GROUND, { col: '#7fb6ff' }); add('apple', 300, GROUND); add('balloon', 1000, GROUND - 60, { col: '#ff6b9e' });
  add('teddy', 1070, GROUND - 60);
  // kitchen: fridge contents and counter
  add('milk', 1470, GROUND - 160); add('cheese', 1525, GROUND - 160); add('cake', 1470, GROUND - 85); add('carrot', 1525, GROUND - 85);
  add('fish', 1490, GROUND - 10); add('egg', 1535, GROUND - 10);
  add('bread', 1620, GROUND - 110); add('banana', 1760, GROUND - 110);
  // living
  add('book', 2590, GROUND - 90, { col: '#ff8f8f' }); add('guitar', 2330, GROUND); add('plant', 2090, GROUND);
  // bedroom
  add('teddy', 1640, 500 - 62); add('hat', 1770, 500 - 165, { v: { k: 'crown' } }); add('glasses', 1815, 500 - 165, { v: 'star' });
  add('hat', 1790, 500 - 90, { v: { k: 'beanie' } }); add('shirt', 1790, 500 - 10, { v: { col: '#ffe27a', style: 1 } });
  add('book', 1930, 420, { col: '#9fe07f' }); add('gift', 1480, 500);
  // bathroom
  add('duck', 2170, 500 - 60); add('toothbrush', 2560, 500 - 100);
  // cafe
  add('donut', 3460, GROUND - 110, { col: '#7fd6ff' }); add('coffee', 3510, GROUND - 110); add('cupcake', 3680, GROUND - 110);
  // boutique shelves
  add('hat', 3985, GROUND - 290, { v: { k: 'cap' } }); add('hat', 4045, GROUND - 290, { v: { k: 'bow' } }); add('hat', 4100, GROUND - 290, { v: { k: 'top' } });
  add('glasses', 3990, GROUND - 200, { v: 'round' }); add('glasses', 4060, GROUND - 200, { v: 'sun' }); add('hat', 4090, GROUND - 110, { v: { k: 'flower' } });
  add('hat', 3990, GROUND - 110, { v: { k: 'beanie', col: '#ff9fd0' } });
  return I;
}

function initialChars() {
  const base = (x, y, look) => ({ x, y, look: { ...randomLook(), ...look } });
  return [
    base(560, GROUND, { skin: SKINS[1], hair: 3, hairColor: HAIRC[4], shirt: '#ffe27a', shirtStyle: 2, pants: '#ff8f8f', eyes: 1 }),
    base(1900, GROUND, { skin: SKINS[3], hair: 2, hairColor: HAIRC[0], shirt: '#7fb6ff', shirtStyle: 1, pants: '#5d667c', eyes: 0 }),
    base(2380, 500, { skin: SKINS[0], hair: 1, hairColor: HAIRC[3], shirt: '#b99dff', shirtStyle: 0, pants: '#7fd6ff', eyes: 2 }),
    base(3200, GROUND, { skin: SKINS[4], hair: 4, hairColor: HAIRC[5], shirt: '#9fe07f', shirtStyle: 0, pants: '#ffffff', eyes: 1 }),
    base(4400, GROUND, { skin: SKINS[2], hair: 0, hairColor: HAIRC[6], shirt: '#ffa3d2', shirtStyle: 2, pants: '#ffb870', eyes: 0 }),
  ];
}

// ------------------------------------------------------------------ backgrounds (screen-space sky, world-space buildings)
function drawSky(c, W, H, camX, night, t, scale) {
  const g = c.createLinearGradient(0, 0, 0, H);
  if (night) { g.addColorStop(0, '#1e2350'); g.addColorStop(1, '#4b4f8f'); } else { g.addColorStop(0, '#9fdcff'); g.addColorStop(1, '#e6f7ff'); }
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (night) {
    for (let i = 0; i < 60; i++) {
      const x = ((i * 137.5 - camX * 0.05 * scale) % W + W) % W, y = (i * 61) % (H * 0.55);
      c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i); star(c, x, y, 2.5 + (i % 3), '#fff8c4', 4);
    }
    c.globalAlpha = 1;
    fC(c, W * 0.8, H * 0.14, 34 * scale + 10, '#fff4c4'); fC(c, W * 0.8 + 14 * scale, H * 0.14 - 8 * scale, 30 * scale + 8, night ? '#2a2f64' : '#fff');
  } else {
    fC(c, W * 0.82, H * 0.14, 50 * scale + 10, '#fff1a6');
    for (let i = 0; i < 6; i++) {
      const x = ((i * 520 + t * 12 - camX * 0.25) * scale % (W + 400) + W + 400) % (W + 400) - 200, y = (90 + (i * 53) % 140) * scale;
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (const [dx, dy, r] of [[0, 0, 36], [36, -14, 44], [76, 0, 34], [38, 10, 36]]) { c.beginPath(); c.arc(x + dx * scale, y + dy * scale, r * scale, 0, TAU); c.fill(); }
    }
  }
}

function drawHills(c, camX, night) {
  // Parallax hills drawn in world units but shifted by half the camera movement.
  c.save(); c.translate(camX * 0.5, 0);
  for (let i = -1; i < 8; i++) {
    const x = i * 900;
    fE(c, x + 300, GROUND + 40, 520, 260, night ? '#3a5e6a' : '#b9e8b0');
    fE(c, x + 750, GROUND + 60, 420, 200, night ? '#35556a' : '#a6dda0');
  }
  c.restore();
}

function windowView(c, x, y, w, h, night, t) {
  fRR(c, x - 8, y - 8, w + 16, h + 16, 10, '#ffffff');
  fRR(c, x, y, w, h, 6, night ? '#2a2f64' : '#aee3ff');
  if (night) star(c, x + w * 0.7, y + h * 0.3, 5, '#fff8c4', 4);
  else { fC(c, x + w * 0.3 + Math.sin(t * 0.2) * 10, y + h * 0.4, 12, '#fff'); fC(c, x + w * 0.3 + 14 + Math.sin(t * 0.2) * 10, y + h * 0.4, 14, '#fff'); }
  fRR(c, x + w / 2 - 3, y, 6, h, 0, '#ffffff'); fRR(c, x, y + h / 2 - 3, w, 6, 0, '#ffffff');
}

function wallpaper(c, x0, y0, x1, y1, base, kind, col2) {
  c.fillStyle = base; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
  c.fillStyle = col2;
  if (kind === 'dots') for (let y = y0 + 20; y < y1; y += 40) for (let x = x0 + ((y / 40) % 2 ? 20 : 0); x < x1; x += 40) { c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }
  if (kind === 'stripes') for (let x = x0; x < x1; x += 44) c.fillRect(x, y0, 18, y1 - y0);
  if (kind === 'stars') for (let y = y0 + 30; y < y1; y += 60) for (let x = x0 + ((y / 60) % 2 ? 30 : 0); x < x1; x += 60) star(c, x, y, 7, col2, 5);
  if (kind === 'tiles') { for (let x = x0; x < x1; x += 40) c.fillRect(x, y0, 3, y1 - y0); for (let y = y0; y < y1; y += 40) c.fillRect(x0, y, x1 - x0, 3); }
  if (kind === 'diamonds') for (let y = y0; y < y1; y += 50) for (let x = x0 + ((y / 50) % 2 ? 25 : 0); x < x1; x += 50) fPoly(c, [x, y - 10, x + 8, y, x, y + 10, x - 8, y], col2);
  c.restore();
}

function floorBand(c, x0, x1, y, col) {
  c.fillStyle = col; c.fillRect(x0, y, x1 - x0, 24);
  c.fillStyle = shade(col, -0.12);
  for (let x = x0 + 30; x < x1; x += 90) c.fillRect(x, y + 4, 3, 18);
  c.fillRect(x0, y + 20, x1 - x0, 4);
}

function drawTown(c, t, night) {
  // ground
  c.fillStyle = night ? '#4f8a5a' : '#8fd46b'; c.fillRect(-200, GROUND, WORLD_W + 400, 400);
  c.fillStyle = night ? '#6e6a80' : '#f1dfc0'; c.fillRect(-200, GROUND + 40, WORLD_W + 400, 34);
  for (let x = 20; x < WORLD_W; x += 70) { fC(c, x, GROUND + 10, 5, night ? '#5c9a66' : '#7cc45a'); }
  // park flowers & fence
  for (let x = 20; x < 1380; x += 46) { fRR(c, x, GROUND - 60, 10, 60, 4, night ? '#c0b8d8' : '#ffffff'); }
  c.fillStyle = night ? '#c0b8d8' : '#ffffff'; c.fillRect(0, GROUND - 48, 1380, 8); c.fillRect(0, GROUND - 24, 1380, 8);
  for (let x = 40; x < 1380; x += 90) { line(c, x, GROUND, x, GROUND - 22, 3, '#57c26b'); fC(c, x, GROUND - 26, 7, ['#ff8fc8', '#ffe066', '#ffffff', '#b99dff'][(x / 90 | 0) % 4]); }

  // ---- house
  c.beginPath(); c.moveTo(1360, 250); c.lineTo(1500, 110); c.lineTo(2600, 110); c.lineTo(2740, 250); c.closePath(); c.fillStyle = '#ff8f7a'; c.fill();
  for (let y = 140; y < 250; y += 28) { c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(1380, y, 1340, 6); }
  fRR(c, 2450, 60, 60, 90, 6, '#d9795f');
  fC(c, 2050, 185, 36, '#fff6e6'); fC(c, 2050, 185, 26, night ? '#fff3b0' : '#aee3ff');
  c.fillStyle = '#f7d9b0'; c.fillRect(1400, 236, 1300, 574);
  wallpaper(c, 1420, 520, 2044, 800, '#d4f1e4', 'tiles', '#bfe6d4');
  wallpaper(c, 2056, 520, 2680, 800, '#ffe3d1', 'dots', '#ffd1b8');
  wallpaper(c, 1420, 240, 2044, 500, '#e8deff', 'stars', '#d8caff');
  wallpaper(c, 2056, 240, 2680, 500, '#dcf2ff', 'tiles', '#c4e6ff');
  windowView(c, 1640, 565, 110, 80, night, t);
  windowView(c, 2130, 565, 160, 100, night, t);
  windowView(c, 1915, 280, 90, 80, night, t);
  fC(c, 2480, 310, 36, '#fff'); fC(c, 2480, 310, 28, night ? '#2a2f64' : '#aee3ff');
  // rug
  fE(c, 2250, GROUND - 2, 190, 14, '#ffd36e'); fE(c, 2250, GROUND - 2, 150, 9, '#ffe9a8');
  // partitions (with doorways)
  c.fillStyle = '#f7d9b0'; c.fillRect(2044, 520, 12, 90); c.fillRect(2044, 240, 12, 90);
  floorBand(c, 1400, 2700, 500, '#e0a870');
  c.fillStyle = '#f7d9b0'; c.fillRect(1400, 236, 1300, 6);
  floorBand(c, 1400, 2700, GROUND, '#d99a66');
  // front door
  fRR(c, 1402, 640, 16, 160, 4, '#ff9f8f');

  // ---- cafe
  fRR(c, 2790, 240, 1020, 150, 14, '#ffb870');
  fRR(c, 2980, 270, 640, 80, 40, '#fff6e6');
  c.fillStyle = '#e5594c'; c.font = 'bold 50px sans-serif'; c.textAlign = 'center'; c.fillText('カフェ ぽかぽか', 3300, 328); c.textAlign = 'left';
  c.fillStyle = '#ffb870'; c.fillRect(2800, 380, 1000, 430);
  wallpaper(c, 2820, 390, 3780, 800, '#fff4d6', 'stripes', '#ffeac0');
  c.fillStyle = '#e7b98a'; c.fillRect(2820, 700, 960, 100);
  windowView(c, 3400, 460, 320, 150, night, t);
  for (let i = 0; i < 12; i++) fPoly(c, [2800 + i * 84, 390, 2884 + i * 84, 390, 2842 + i * 84, 430], i % 2 ? '#fff' : '#ff8f8f');
  // menu board
  fRR(c, 2880, 440, 200, 120, 10, '#3d3a4a');
  c.fillStyle = '#fff'; c.font = '22px sans-serif'; c.fillText('☕ コーヒー', 2900, 480); c.fillText('🍰 ケーキ', 2900, 512); c.fillText('🥐 パン', 2900, 544);
  floorBand(c, 2800, 3800, GROUND, '#c98a5c');

  // ---- boutique
  fRR(c, 3890, 240, 1020, 150, 14, '#ff9fd0');
  fRR(c, 4080, 270, 640, 80, 40, '#fff0f6');
  c.fillStyle = '#b060c0'; c.font = 'bold 50px sans-serif'; c.textAlign = 'center'; c.fillText('ようふくや きらり', 4400, 328); c.textAlign = 'left';
  c.fillStyle = '#ff9fd0'; c.fillRect(3900, 380, 1000, 430);
  wallpaper(c, 3920, 390, 4880, 800, '#ffe8f2', 'diamonds', '#ffd0e4');
  fRR(c, 4200, 420, 140, 40, 20, '#fff'); star(c, 4230, 440, 10, '#ffd23f'); star(c, 4310, 440, 10, '#ffd23f');
  floorBand(c, 3900, 4900, GROUND, '#f0c090');
}
