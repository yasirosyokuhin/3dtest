'use strict';
// Cute synthesised sounds and a little music-box tune for the radio.
const Sfx = (() => {
  let ctx = null, master, noiseBuf;
  const loops = {};
  let muted = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(f, dur, { type = 'sine', vol = 0.25, f2 = 0, when = 0, a = 0.005 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { f = 1000, type = 'bandpass', q = 1, vol = 0.2, when = 0, f2 = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function loop(key, on, make) {
    if (!ctx) return;
    if (on && !loops[key]) loops[key] = make();
    if (!on && loops[key]) { const l = loops[key]; l.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => l.s.stop(), 300); delete loops[key]; }
  }
  function noiseLoop(f, q, vol) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
    s.connect(fl); fl.connect(g); g.connect(master); s.start();
    return { s, g };
  }

  return {
    init,
    get ctx() { return ctx; },
    get master() { return master; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    get muted() { return muted; },
    pick() { tone(520, 0.12, { type: 'triangle', f2: 900, vol: 0.2 }); },
    drop() { tone(300, 0.1, { type: 'sine', f2: 160, vol: 0.25 }); },
    land() { tone(180, 0.08, { vol: 0.2, f2: 90 }); },
    squeak() { tone(700, 0.18, { type: 'triangle', f2: 1400, vol: 0.18 }); tone(1300, 0.12, { type: 'sine', f2: 1000, vol: 0.1, when: 0.12 }); },
    pop(p = 1) { tone(400 * p, 0.12, { type: 'sine', f2: 900 * p, vol: 0.25 }); },
    click() { tone(1500, 0.03, { type: 'square', vol: 0.08 }); },
    boop() { tone(260, 0.15, { type: 'triangle', vol: 0.15 }); },
    chomp() { noise(0.07, { f: 900, q: 2, vol: 0.35 }); tone(220, 0.06, { type: 'square', vol: 0.05, f2: 150 }); },
    yum() { [660, 880, 990].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.15, when: i * 0.08 })); },
    sparkle() { [1320, 1760, 2090, 2640].forEach((f, i) => tone(f, 0.25, { vol: 0.1, when: i * 0.06 })); },
    poof() { noise(0.3, { f: 2000, f2: 300, q: 0.8, vol: 0.25 }); },
    boing() { tone(200, 0.35, { type: 'sine', f2: 600, vol: 0.2 }); },
    bounce() { tone(260, 0.1, { f2: 520, vol: 0.15 }); },
    rustle() { noise(0.35, { f: 3000, q: 0.7, vol: 0.12 }); },
    door(open) { tone(open ? 300 : 200, 0.12, { type: 'triangle', f2: open ? 450 : 120, vol: 0.15 }); noise(0.05, { f: 800, vol: 0.15, when: open ? 0 : 0.1 }); },
    curtain() { noise(0.4, { f: 2500, f2: 1200, q: 0.5, vol: 0.12 }); },
    ding() { tone(1568, 0.8, { vol: 0.2 }); tone(2093, 0.8, { vol: 0.12, when: 0.02 }); },
    flush() { noise(1.3, { f: 600, f2: 200, q: 0.6, vol: 0.35 }); tone(300, 0.5, { f2: 120, vol: 0.05, when: 0.4 }); },
    strum() { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.12, when: i * 0.04 })); },
    pageturn() { noise(0.15, { f: 4000, q: 0.5, vol: 0.1 }); },
    water(on, key) { loop('water_' + key, on, () => noiseLoop(1800, 0.6, 0.06)); },
    sizzle(on) { loop('sizzle', on, () => noiseLoop(5000, 0.4, 0.04)); },
    tv(on) { loop('tv', on, () => { const s = ctx.createOscillator(), g = ctx.createGain(); s.type = 'triangle'; s.frequency.value = 330; const l = ctx.createOscillator(); l.frequency.value = 3; const lg = ctx.createGain(); lg.gain.value = 120; l.connect(lg); lg.connect(s.frequency); l.start(); g.gain.value = 0; g.gain.setTargetAtTime(0.025, ctx.currentTime, 0.05); s.connect(g); g.connect(master); s.start(); return { s, g }; }); },
  };
})();

// A cheerful music-box loop, scheduled ahead while any radio is on.
const Music = (() => {
  const on = new Set();
  const MELODY = [72, 76, 79, 76, 77, 74, 71, 74, 72, 76, 79, 84, 83, 79, 77, 76];
  const BASS = [48, 55, 53, 55];
  let next = 0, step = 0, timer = null;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function tick() {
    const ctx = Sfx.ctx;
    if (!ctx || !on.size) return;
    if (next < ctx.currentTime - 0.1) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.3) {
      const n = MELODY[step % MELODY.length];
      play(hz(n), next, 0.35, 'triangle', 0.09);
      if (step % 4 === 0) play(hz(BASS[(step / 4) % BASS.length]), next, 0.9, 'sine', 0.1);
      next += 0.24; step++;
    }
  }
  function play(f, t, dur, type, vol) {
    const ctx = Sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(Sfx.master); o.start(t); o.stop(t + dur + 0.05);
  }
  return {
    set(id, v) {
      if (v) on.add(id); else on.delete(id);
      if (on.size && !timer) { if (Sfx.ctx) next = Sfx.ctx.currentTime + 0.05; timer = setInterval(tick, 100); }
      if (!on.size && timer) { clearInterval(timer); timer = null; }
    },
    get playing() { return on.size > 0; },
  };
})();
